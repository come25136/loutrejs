import type { IncomingMessage, Server } from 'node:http'
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
        if (!native)
          throw new Error('Node.jsのupgrade requestが見つかりません。')
        requests.delete(request)
        if (native.socket.destroyed)
          throw new Error('WebSocket handshakeが終了しました。')
        protocols.set(native.incoming, options.protocol ?? '')
        const connection = await new Promise<
          ReturnType<typeof createEventWebSocketConnection>
        >((resolve, reject) => {
          const fail = (error: unknown) => {
            cleanup()
            reject(error)
          }
          const onClose = () =>
            fail(new Error('WebSocket handshakeが終了しました。'))
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
          { headers },
        )
        requests.set(request, { incoming, socket, head })
        void application
          .upgrade(request)
          .then(async (response) => {
            if (!requests.has(request)) return
            requests.delete(request)
            const body = await response.text()
            socket.end(
              `HTTP/1.1 ${response.status} ${response.statusText}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
            )
          })
          .catch(() => socket.destroy())
      })
    },
  }
}
