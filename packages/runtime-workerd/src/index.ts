import {
  initializeHttpApplication,
  type HttpApplication,
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

export function createWorkerdFetchHandler(application: HttpApplication) {
  let initialization: Promise<void> | undefined
  return async (
    request: Request,
    environment?: unknown,
  ): Promise<Response> => {
    initialization ??= initializeHttpApplication(application, environment)
    await initialization
    return application.handle(request)
  }
}
