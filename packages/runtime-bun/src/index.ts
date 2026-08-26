import {
  initializeHttpApplication,
  type HttpApplication,
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

export interface BunFetchHandlerOptions {
  readonly environment?: unknown
}

export function createBunFetchHandler(
  application: HttpApplication,
  options: BunFetchHandlerOptions = {},
) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= initializeHttpApplication(
      application,
      'environment' in options
        ? options.environment
        : requiresEnvironment(application)
          ? bunEnvironment()
          : undefined,
    )
    await initialization
    return application.handle(request)
  }
}

function bunEnvironment(): unknown {
  return (globalThis as typeof globalThis & {
    readonly Bun?: { readonly env?: unknown }
  }).Bun?.env
}

function requiresEnvironment(application: HttpApplication): boolean {
  return application.graph.capabilities.some(({ name }) => name === 'env.runtime')
}
