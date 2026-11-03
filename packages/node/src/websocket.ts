import { STATUS_CODES, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer } from 'ws'
import {
  createEventWebSocketConnection,
  type WebSocketServerDriver,
  type WebSocketHostApi,
} from '@loutrejs/loutre/websocket'

export function createNodeWebSocketDriver(): {
  readonly driver: WebSocketServerDriver
  attach(server: Server, application: WebSocketHostApi): void
} {
  const requests = new WeakMap<
    Request,
    { incoming: IncomingMessage; socket: Duplex; head: Buffer }
  >()
  const protocols = new WeakMap<IncomingMessage, string>()
  const websocketServer = new WebSocketServer({
    noServer: true,
    handleProtocols: (_offered, incoming) => protocols.get(incoming) || false,
  })
  return {
    driver: {
      runtime: 'node',
      async upgrade(request, options) {
        const native = requests.get(request)
        if (!native) throw new Error('Node.js upgrade request not found.')
        requests.delete(request)
        if (native.socket.destroyed)
          throw new Error('WebSocket handshake has ended.')
        protocols.set(native.incoming, options.protocol ?? '')
        const connection = await new Promise<
          ReturnType<typeof createEventWebSocketConnection>
        >((resolve, reject) => {
          const fail = (error: unknown) => {
            cleanup()
            reject(error)
          }
          const onClose = () =>
            fail(new Error('WebSocket handshake has ended.'))
          const cleanup = () => {
            native.socket.off('close', onClose)
            native.socket.off('error', fail)
          }
          native.socket.once('close', onClose)
          native.socket.once('error', fail)
          try {
            websocketServer.handleUpgrade(
              native.incoming,
              native.socket,
              native.head,
              (socket) => {
                cleanup()
                resolve(
                  createEventWebSocketConnection(socket, socket.protocol, {
                    terminate: () => socket.terminate(),
                  }),
                )
              },
            )
          } catch (error) {
            fail(error)
          }
        })
        return { connection, response: new Response(null) }
      },
    },
    attach(server, application) {
      server.on('upgrade', (incoming, socket, head) => {
        if (incoming.method !== 'GET') {
          socket.end(
            'HTTP/1.1 405 Method Not Allowed\r\nAllow: GET\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
          )
          return
        }

        const controller = new AbortController()
        const abort = () =>
          controller.abort(new Error('WebSocket handshake has ended.'))
        socket.once('close', abort)
        socket.once('error', abort)

        const headers = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value))
            value.forEach((item) => headers.append(name, item))
          else if (value !== undefined) headers.set(name, value)
        }

        const request = new Request(
          new URL(
            incoming.url ?? '/',
            `http://${incoming.headers.host ?? 'localhost'}`,
          ),
          {
            method: incoming.method ?? 'GET',
            headers,
            signal: controller.signal,
          },
        )
        requests.set(request, { incoming, socket, head })

        void application
          .upgrade(request)
          .then(async (response) => {
            if (!requests.has(request)) return
            requests.delete(request)

            const body = Buffer.from(await response.arrayBuffer())
            const responseHeaders = new Headers(response.headers)
            responseHeaders.set('connection', 'close')
            responseHeaders.set('content-length', String(body.byteLength))
            responseHeaders.delete('transfer-encoding')
            const lines = [
              `HTTP/1.1 ${response.status} ${response.statusText || STATUS_CODES[response.status] || ''}`,
            ]
            responseHeaders.forEach((value, name) => {
              if (name !== 'set-cookie') lines.push(`${name}: ${value}`)
            })
            for (const cookie of responseHeaders.getSetCookie())
              lines.push(`set-cookie: ${cookie}`)
            socket.write(`${lines.join('\r\n')}\r\n\r\n`)
            socket.end(body)
          })
          .catch(() => socket.destroy())
          .finally(() => {
            requests.delete(request)
            socket.off('close', abort)
            socket.off('error', abort)
          })
      })
    },
  }
}
