import {
  type HttpProtocolExecution,
} from '@loutrejs/http'

export const workerdRuntime = {
  runtime: 'workerd',
  compatibilityDateMinimum: '2026-08-04',
  capabilities: new Set([
    'http.server',
    'http.request.streaming',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'background.waitUntil',
    'env.runtime',
    'crypto.random',
  ]),
} as const

/** @internal generated bindingが利用するworkerd HTTP driver。 */
export function createWorkerdFetchDriver(application: HttpProtocolExecution) {
  let initialization: Promise<void> | undefined
  return async (
    request: Request,
    _environment?: unknown,
  ): Promise<Response> => {
    initialization ??= application.initialize()
    await initialization
    return application.handle(request)
  }
}
