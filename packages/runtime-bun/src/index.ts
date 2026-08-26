import {
  type HttpProtocolExecution,
} from '@loutrejs/http'

export const bunRuntime = {
  runtime: 'bun-1.4-stable',
  capabilities: new Set([
    'http.server',
    'http.request.streaming',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'runtime.longLived',
    'runtime.shutdownHook',
    'env.runtime',
    'crypto.random',
  ]),
} as const

/** @internal generated bindingが利用するBun HTTP driver。 */
export function createBunFetchDriver(
  application: HttpProtocolExecution,
) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize()
    await initialization
    return application.handle(request)
  }
}
