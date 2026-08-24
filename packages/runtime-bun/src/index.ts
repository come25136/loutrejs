import type { HttpApplication } from '@loutrejs/http'

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

export function createBunFetchHandler(application: HttpApplication) {
  return (request: Request): Promise<Response> => application.handle(request)
}
