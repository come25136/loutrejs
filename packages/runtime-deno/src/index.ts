import type { HttpApplication } from '@loutrefw/http'

export const denoRuntime = {
  runtime: 'deno-2.9-lts',
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

export function createDenoFetchHandler(application: HttpApplication) {
  return (request: Request): Promise<Response> => application.handle(request)
}
