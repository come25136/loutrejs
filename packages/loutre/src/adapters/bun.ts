import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type HostBindingApplication,
  type InvocationBindingOptions,
} from '../application/index.js'
import type { HttpProtocolExecution } from '../http/index.js'
import {
  LOUTRE_VERSION,
  detectPresentationTerminal,
  startStartupPresentation,
} from '../presentation.js'
import { serverUrl } from '../runtime/server-url.js'

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
  const startedAt = performance.now()
  const environment = bun.env ?? {}
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: detectPresentationTerminal(process.stdout, environment),
      write: (value) => console.log(value),
    },
  )
  const host = binding.host({
    application: options.application,
    environment: 'environment' in options ? options.environment : environment,
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
  presentation.ready({
    server: serverUrl(options.hostname, port),
    runtime: `Bun ${bun.version ?? 'unknown'}`,
    environment: environment.NODE_ENV ?? 'development',
    startupDurationMs: performance.now() - startedAt,
  })
  let closed = false
  let removeShutdownHooks: (() => void) | undefined
  const handle: BunServeHandle<TDefinition> = {
    application: host.application,
    port,
    async close(signal?: string) {
      if (closed) return
      closed = true
      removeShutdownHooks?.()
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
  removeShutdownHooks = registerBunShutdownHooks((signal) =>
    handle.close(signal),
  )
  return handle
}

function registerBunShutdownHooks(
  close: (signal: string) => Promise<void>,
): () => void {
  const handlers = new Map<NodeJS.Signals, () => void>()
  const remove = () => {
    for (const [signal, handler] of handlers) process.off(signal, handler)
    handlers.clear()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      remove()
      void close(signal)
    }
    handlers.set(signal, handler)
    process.once(signal, handler)
  }
  return remove
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
      version?: string
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
        version?: string
        serve(options: {
          port: number
          hostname?: string
          fetch(request: Request): Response | Promise<Response>
        }): { stop(closeActiveConnections?: boolean): void | Promise<void> }
      }
    | undefined
}
