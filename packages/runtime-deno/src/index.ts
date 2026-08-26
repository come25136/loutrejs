import {
  initializeHttpApplication,
  type HttpApplication,
} from '@loutrejs/http'

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

export interface DenoFetchHandlerOptions {
  readonly environment?: unknown
}

export function createDenoFetchHandler(
  application: HttpApplication,
  options: DenoFetchHandlerOptions = {},
) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= initializeHttpApplication(
      application,
      'environment' in options
        ? options.environment
        : requiresEnvironment(application)
          ? denoEnvironment()
          : undefined,
    )
    await initialization
    return application.handle(request)
  }
}

function denoEnvironment(): unknown {
  return (globalThis as typeof globalThis & {
    readonly Deno?: {
      readonly env: {
        toObject(): Readonly<Record<string, string>>
      }
    }
  }).Deno?.env.toObject()
}

function requiresEnvironment(application: HttpApplication): boolean {
  return application.graph.capabilities.some(({ name }) => name === 'env.runtime')
}
