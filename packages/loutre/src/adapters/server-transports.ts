import type {
  ApplicationModel,
  RuntimeCapabilityBinding,
} from '../core/index.js'
import { bindHttpServer, type HttpHostApi } from '../http/index.js'
import {
  bindWebSocketServer,
  type WebSocketHostApi,
  type WebSocketServerDriver,
} from '../websocket/index.js'

export function serverTransportBindings(
  model: ApplicationModel,
  runtime: string,
  websocket: WebSocketServerDriver,
): RuntimeCapabilityBinding[] {
  const requires = (id: string) =>
    model.executions.some((execution) =>
      execution.capabilities.some((capability) => capability.id === id),
    )
  return [
    ...(requires('http.server') ? [bindHttpServer({ runtime })] : []),
    ...(requires('websocket.server') ? [bindWebSocketServer(websocket)] : []),
  ]
}

export function dispatchServerRequest(
  application: object,
  request: Request,
): Promise<Response> {
  const transports = application as {
    readonly http?: HttpHostApi
    readonly websocket?: WebSocketHostApi
  }
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return (
      transports.websocket?.upgrade(request) ??
      Promise.resolve(new Response('Not Found', { status: 404 }))
    )
  }
  return (
    transports.http?.fetch(request) ??
    Promise.resolve(new Response('Not Found', { status: 404 }))
  )
}
