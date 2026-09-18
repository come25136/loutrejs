import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  type DevtoolsControlEvent,
  type DevtoolsControlMethod,
  DevtoolsControlPlane,
} from './control-plane.js'
import { DEVTOOLS_PROTOCOL_VERSION } from './protocol.js'
import { isDevtoolsLoopbackRequest } from './security.js'

export const DEVTOOLS_CLIENT_CHANNEL_PATH = '/__loutre/client'

interface ClientRequestMessage {
  readonly type: 'request'
  readonly id: string
  readonly method: DevtoolsControlMethod
  readonly params?: unknown
}

interface ClientHelloMessage {
  readonly type: 'hello'
  readonly protocolVersion: number
}

type ClientResponseMessage =
  | {
      readonly type: 'response'
      readonly id: string
      readonly ok: true
      readonly result: unknown
    }
  | {
      readonly type: 'response'
      readonly id: string
      readonly ok: false
      readonly error: {
        readonly name: string
        readonly message: string
      }
    }

export interface DevtoolsClientChannel {
  close(): Promise<void>
}

export function attachDevtoolsClientChannel(
  server: Server,
  options: {
    readonly origins: ReadonlySet<string>
    readonly controlPlane: DevtoolsControlPlane
  },
): DevtoolsClientChannel {
  const websocketServer = new WebSocketServer({ noServer: true })

  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    let pathname: string
    try {
      pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== DEVTOOLS_CLIENT_CHANNEL_PATH) return
    if (!isDevtoolsLoopbackRequest(request)) {
      socket.destroy()
      return
    }
    const origin = request.headers.origin
    if (origin !== undefined && !options.origins.has(origin)) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request)
    })
  }
  server.on('upgrade', onUpgrade)

  websocketServer.on('connection', (websocket) => {
    attachClient(websocket, options.controlPlane)
  })

  return {
    async close() {
      server.off('upgrade', onUpgrade)
      for (const client of websocketServer.clients) client.terminate()
      await new Promise<void>((resolve, reject) => {
        websocketServer.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

function attachClient(
  websocket: WebSocket,
  controlPlane: DevtoolsControlPlane,
): void {
  send(websocket, {
    type: 'hello',
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
  })
  const unsubscribe = controlPlane.subscribe((event) => {
    send(websocket, event)
  })

  websocket.on('message', (data, isBinary) => {
    if (isBinary) {
      websocket.close(1003, 'binary messages are not supported')
      return
    }
    const message = parseMessage(data.toString())
    if (!isClientRequest(message)) {
      websocket.close(1007, 'invalid request')
      return
    }
    void controlPlane
      .request(message)
      .then((result) => {
        send(websocket, {
          type: 'response',
          id: message.id,
          ok: true,
          result,
        } satisfies ClientResponseMessage)
      })
      .catch((error: unknown) => {
        send(websocket, {
          type: 'response',
          id: message.id,
          ok: false,
          error: serializeError(error),
        } satisfies ClientResponseMessage)
      })
  })

  websocket.once('close', unsubscribe)
}

function send(
  websocket: WebSocket,
  message: ClientHelloMessage | ClientResponseMessage | DevtoolsControlEvent,
): void {
  if (websocket.readyState !== websocket.OPEN) return
  websocket.send(JSON.stringify(message))
}

function parseMessage(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function isClientRequest(value: unknown): value is ClientRequestMessage {
  return (
    isRecord(value) &&
    value.type === 'request' &&
    typeof value.id === 'string' &&
    typeof value.method === 'string' &&
    isControlMethod(value.method)
  )
}

function isControlMethod(value: string): value is DevtoolsControlMethod {
  return [
    'graph.get',
    'graph.reload',
    'graph.snapshots.list',
    'graph.snapshot.get',
    'graph.snapshot.create',
    'graph.snapshot.rename',
    'graph.snapshot.delete',
    'graph.base.get',
    'graph.base.set',
    'runtime.runs',
    'runtime.traces',
    'runtime.traces.clear',
    'runtime.trace.get',
    'runtime.capsule.replay',
    'runtime.provider.playground',
    'runtime.provider.invoke',
  ].includes(value)
}

function serializeError(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'Error', message: String(error) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
