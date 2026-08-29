import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type HostBindingApplication,
  type InvocationBindingOptions,
} from '../application/index.js'
import type { HttpProtocolExecution } from '../http/index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : never

export type BunServeOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly port?: number
  readonly hostname?: string
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export interface BunServeHandle<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> {
  readonly application: HostBindingApplication<TDefinition>
  readonly port: number
  close(signal?: string): Promise<void>
}

export const bunRuntime = {
  runtime: 'bun',
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
  serve,
} as const

async function serve<const TDefinition extends ApplicationDefinition>(
  options: BunServeOptions<TDefinition>,
): Promise<BunServeHandle<TDefinition>> {
  const bun = bunGlobal()
  if (!bun?.serve) {
    throw new Error('LUTRE_BUN_UNAVAILABLE: Bun.serve() is not available.')
  }
  const host = binding.host({
    application: options.application,
    environment:
      'environment' in options ? options.environment : (bun.env ?? undefined),
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  } as unknown as InvocationBindingOptions<TDefinition>)
  const http = 'http' in host ? (host.http as HttpProtocolExecution) : undefined
  if (!http) {
    await host.application.close()
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: bunRuntime.serve() requires an HTTP-capable Application.',
    )
  }

  await host.application.init()
  if ('triggers' in host.application) await host.application.triggers.start()
  let server: { stop(closeActiveConnections?: boolean): void | Promise<void> }
  const requestedPort = options.port
  let port = requestedPort ?? 3000
  while (true) {
    try {
      server = bun.serve({
        port,
        ...(options.hostname === undefined
          ? {}
          : { hostname: options.hostname }),
        fetch: createBunFetchDriver(http),
      })
      break
    } catch (error) {
      if (requestedPort !== undefined || !canRetryOnNextPort(error, port)) {
        await host.application.close().catch(() => undefined)
        throw error
      }
      port += 1
    }
  }
  let closed = false
  return {
    application: host.application,
    port,
    async close(signal?: string) {
      if (closed) return
      closed = true
      const errors: unknown[] = []
      try {
        await server.stop(true)
      } catch (error) {
        errors.push(error)
      }
      try {
        await host.application.close(signal)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length > 0)
        throw new AggregateError(errors, 'Bun runtime shutdown failed')
    },
  }
}

function canRetryOnNextPort(error: unknown, port: number): boolean {
  return port < 65_535 && isAddressInUseError(error)
}

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  )
}

function createBunFetchDriver(application: HttpProtocolExecution) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize()
    await initialization
    return application.handle(request)
  }
}

function bunGlobal():
  | {
      env?: Record<string, string | undefined>
      serve(options: {
        port: number
        hostname?: string
        fetch(request: Request): Response | Promise<Response>
      }): { stop(closeActiveConnections?: boolean): void | Promise<void> }
    }
  | undefined {
  return (globalThis as typeof globalThis & { Bun?: unknown }).Bun as
    | {
        env?: Record<string, string | undefined>
        serve(options: {
          port: number
          hostname?: string
          fetch(request: Request): Response | Promise<Response>
        }): { stop(closeActiveConnections?: boolean): void | Promise<void> }
      }
    | undefined
}
