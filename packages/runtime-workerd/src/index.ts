import type { HttpApplication } from '@loutrejs/http'

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

export function createWorkerdFetchHandler(application: HttpApplication) {
  return (request: Request): Promise<Response> => application.handle(request)
}
