import type {
  WebSocketCloseInfo,
  WebSocketConnectionDriver,
  WebSocketDataMessage,
} from './extension.js'

export interface WebSocketDriverChannel {
  readonly connection: WebSocketConnectionDriver
  receive(message: WebSocketDataMessage): void
  finish(info: WebSocketCloseInfo): void
}

export function createWebSocketDriverChannel(options: {
  readonly protocol: string
  readonly send: WebSocketConnectionDriver['send']
  readonly close: WebSocketConnectionDriver['close']
  readonly terminate: WebSocketConnectionDriver['terminate']
}): WebSocketDriverChannel {
  const queue: WebSocketDataMessage[] = []
  let done = false
  let wake: (() => void) | undefined
  let resolveClosed!: (info: WebSocketCloseInfo) => void
  const closed = new Promise<WebSocketCloseInfo>((resolve) => {
    resolveClosed = resolve
  })
  return {
    connection: {
      ...options,
      closed,
      messages: {
        async *[Symbol.asyncIterator]() {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift()!
              continue
            }
            if (done) return
            await new Promise<void>((resolve) => {
              wake = resolve
            })
          }
        },
      },
    },
    receive(message) {
      if (done) return
      queue.push(message)
      wake?.()
      wake = undefined
    },
    finish(info) {
      if (done) return
      done = true
      queue.length = 0
      resolveClosed(info)
      wake?.()
      wake = undefined
    },
  }
}

export interface EventWebSocket {
  readonly readyState: number
  binaryType: string
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: 'open',
    listener: () => void,
    options?: { once?: boolean },
  ): void
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void
  addEventListener(
    type: 'close',
    listener: (event: WebSocketCloseInfo) => void,
  ): void
  addEventListener(type: 'error', listener: () => void): void
}

export function createEventWebSocketConnection(
  socket: EventWebSocket,
  protocol: string,
  options: {
    readonly terminate?: () => void
    readonly run?: <T>(operation: () => T) => Promise<T>
  } = {},
): WebSocketConnectionDriver {
  const run = <T>(operation: () => T): Promise<T> =>
    options.run ? options.run(operation) : Promise.resolve().then(operation)
  const opened =
    socket.readyState === 1
      ? Promise.resolve()
      : new Promise<void>((resolve) =>
          socket.addEventListener('open', resolve, { once: true }),
        )
  socket.binaryType = 'arraybuffer'
  const channel = createWebSocketDriverChannel({
    protocol,
    async send(message) {
      await Promise.race([
        opened,
        channel.connection.closed.then(() => {
          throw new Error('WebSocketは終了しました。')
        }),
      ])
      await run(() => {
        if (socket.readyState !== 1)
          throw new Error('WebSocketはopenではありません。')
        socket.send(message.data)
      })
    },
    async close(code = 1000, reason = '') {
      await run(() => socket.close(code, reason))
    },
    async terminate() {
      try {
        await run(() =>
          options.terminate
            ? options.terminate()
            : socket.close(1001, 'Going Away'),
        )
      } finally {
        channel.finish({ code: 1006, reason: '', wasClean: false })
      }
    },
  })
  socket.addEventListener('message', ({ data }) => {
    if (typeof data === 'string') channel.receive({ type: 'text', data })
    else if (data instanceof ArrayBuffer)
      channel.receive({ type: 'binary', data: new Uint8Array(data) })
    else if (ArrayBuffer.isView(data))
      channel.receive({
        type: 'binary',
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      })
  })
  socket.addEventListener('close', (info) => channel.finish(info))
  socket.addEventListener('error', () =>
    channel.finish({ code: 1006, reason: '', wasClean: false }),
  )
  return channel.connection
}
