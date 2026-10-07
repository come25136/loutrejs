import {
  createEventWebSocketConnection,
  createWebSocketDriverChannel,
  type EventWebSocket,
  type WebSocketServerDriver,
  type WebSocketDriverChannel,
} from '../websocket/index.js'

export function createDenoWebSocketDriver(): WebSocketServerDriver {
  return {
    runtime: 'deno',
    async upgrade(request, { protocol }) {
      const deno = (
        globalThis as unknown as {
          Deno: {
            upgradeWebSocket(
              request: Request,
              options: { protocol?: string },
            ): { response: Response; socket: EventWebSocket }
          }
        }
      ).Deno
      const { response, socket } = deno.upgradeWebSocket(
        request,
        protocol === undefined ? {} : { protocol },
      )
      return {
        response,
        connection: createEventWebSocketConnection(socket, protocol ?? ''),
      }
    },
  }
}

export function createCloudflareWebSocketDriver(): WebSocketServerDriver {
  return {
    runtime: 'cloudflare-workers',
    async upgrade(_request, { protocol }) {
      const Pair = (
        globalThis as unknown as {
          WebSocketPair: new () => {
            0: EventWebSocket
            1: EventWebSocket & { accept(): void }
          }
        }
      ).WebSocketPair
      const pair = new Pair()
      pair[1].accept()
      // WorkersのI/Oはopening requestへ所属するため、別requestからのdrainをそのcontextへ戻す。
      const io = createOwnedWebSocketIo()
      const connection = createEventWebSocketConnection(
        pair[1],
        protocol ?? '',
        { run: io.run },
      )
      void connection.closed.then(io.stop)
      const response = new Response(null, {
        status: 101,
        webSocket: pair[0],
        headers: protocol ? { 'sec-websocket-protocol': protocol } : {},
      } as ResponseInit)
      return { response, connection }
    },
  }
}

interface BunSocket {
  readonly data: WebSocketDriverChannel
  send(message: string | Uint8Array): number
  close(code?: number, reason?: string): void
  terminate(): void
}

export interface BunUpgradeServer {
  upgrade(
    request: Request,
    options: { headers: Record<string, string>; data: WebSocketDriverChannel },
  ): boolean
}

export function createBunWebSocketDriver() {
  const requests = new WeakMap<
    Request,
    { readonly server: BunUpgradeServer; readonly accepted: () => void }
  >()
  const upgraded = new WeakSet<Request>()
  const driver: WebSocketServerDriver = {
    runtime: 'bun',
    async upgrade(request, { protocol }) {
      const native = requests.get(request)
      const server = native?.server
      if (!server) throw new Error('Bunのupgrade serverが見つかりません。')
      let socket: BunSocket | undefined
      let open!: () => void
      const opened = new Promise<void>((resolve) => {
        open = resolve
      })
      const channel = createWebSocketDriverChannel({
        protocol: protocol ?? '',
        async send(message) {
          await opened
          socket!.send(message.data)
        },
        async close(code = 1000, reason = '') {
          await opened
          socket!.close(code, reason)
        },
        terminate() {
          socket?.terminate()
          channel.finish({ code: 1006, reason: '', wasClean: false })
        },
      })
      pending.set(channel, (value) => {
        socket = value
        open()
      })
      if (
        !server.upgrade(request, {
          headers: protocol ? { 'sec-websocket-protocol': protocol } : {},
          data: channel,
        })
      ) {
        pending.delete(channel)
        throw new Error('Bun WebSocket upgradeに失敗しました。')
      }
      upgraded.add(request)
      native!.accepted()
      return { response: new Response(), connection: channel.connection }
    },
  }
  const pending = new WeakMap<
    WebSocketDriverChannel,
    (socket: BunSocket) => void
  >()
  return {
    driver,
    async fetch(
      application: object,
      request: Request,
      server: BunUpgradeServer,
      dispatch: (application: object, request: Request) => Promise<Response>,
    ): Promise<Response | undefined> {
      let accept!: () => void
      const accepted = new Promise<undefined>((resolve) => {
        accept = () => resolve(undefined)
      })
      requests.set(request, { server, accepted: accept })
      try {
        const dispatched = dispatch(application, request).then((response) =>
          upgraded.has(request) ? undefined : response,
        )
        return await Promise.race([dispatched, accepted])
      } finally {
        requests.delete(request)
      }
    },
    websocket: {
      open(socket: BunSocket) {
        pending.get(socket.data)?.(socket)
        pending.delete(socket.data)
      },
      message(socket: BunSocket, message: string | Uint8Array) {
        socket.data.receive(
          typeof message === 'string'
            ? { type: 'text', data: message }
            : { type: 'binary', data: new Uint8Array(message) },
        )
      },
      close(socket: BunSocket, code: number, reason: string) {
        socket.data.finish({ code, reason, wasClean: code !== 1006 })
      },
    },
  }
}

function createOwnedWebSocketIo() {
  const queue: { run(): void; cancel(): void }[] = []
  let active = true
  let wake: (() => void) | undefined
  const stopped = new Error('WebSocketは終了しました。')
  const pump = async () => {
    while (true) {
      if (!active) return
      const task = queue.shift()
      if (task) task.run()
      else
        await new Promise<void>((resolve) => {
          wake = resolve
        })
    }
  }
  void pump()
  return {
    run<T>(operation: () => T): Promise<T> {
      if (!active) return Promise.reject(stopped)
      return new Promise<T>((resolve, reject) => {
        queue.push({
          run() {
            try {
              resolve(operation())
            } catch (error) {
              reject(error)
            }
          },
          cancel() {
            reject(stopped)
          },
        })
        wake?.()
        wake = undefined
      })
    },
    stop() {
      active = false
      for (const task of queue.splice(0)) task.cancel()
      wake?.()
      wake = undefined
    },
  }
}
