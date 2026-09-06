import {
  createKernelApplication,
  type ApplicationDefinition,
  type ApplicationExtensionHostApis,
  type BootstrapArguments,
  type KernelHostedApplication,
} from '../application/index.js'
import {
  applicationHasHost,
  bindApplicationCapability,
} from '../application/kernel-internal.js'
import {
  LOUTRE_VERSION,
  detectPresentationTerminal,
  startStartupPresentation,
} from '../presentation.js'
import { assertRuntimeEngine } from '../runtime/engine.js'
import { serverUrl } from '../runtime/server-url.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HasHttpExecutionExtension<TDefinition extends ApplicationDefinition> =
  'http' extends keyof ApplicationExtensionHostApis<TDefinition> ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttpExecutionExtension<TDefinition> extends true
      ? TDefinition
      : never

type BunServer = {
  stop(closeActiveConnections?: boolean): void | Promise<void>
}

export type BunCreateOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export interface BunServeOptions {
  readonly port?: number
  readonly hostname?: string
  readonly shutdownHooks?: boolean
}

export interface BunListenerHandle {
  readonly port: number
}

export type BunRuntimeApplication<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> = KernelHostedApplication<TDefinition> & {
  serve(options?: BunServeOptions): Promise<BunListenerHandle>
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
  create,
} as const

async function create<const TDefinition extends ApplicationDefinition>(
  options: BunCreateOptions<TDefinition>,
): Promise<BunRuntimeApplication<TDefinition>> {
  assertRuntimeEngine('bun')
  const bun = bunGlobal()
  const startedAt = performance.now()
  const environment = bun?.env ?? {}
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: detectPresentationTerminal(process.stdout, environment),
      write: (value) => console.log(value),
    },
  )

  if (!applicationHasHost(options.application.model, 'http')) {
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: bunRuntime.create() requires the HTTP Execution Extension.',
    )
  }

  const hosted = createKernelApplication({
    application: options.application,
    capabilities: [
      bindApplicationCapability(options.application.model, 'http.server', {
        runtime: 'bun',
      }),
    ],
    environment: 'environment' in options ? options.environment : environment,
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  })
  await hosted.init()
  const application = hosted as BunRuntimeApplication<TDefinition>
  const http = (hosted as unknown as { readonly http: BunHttpRequestHandler })
    .http

  const closeApplication = application.close.bind(application)
  let server: BunServer | undefined
  let removeShutdownHooks: (() => void) | undefined
  let serving = false
  let closed = false

  const close = async (signal?: string): Promise<void> => {
    if (closed) return
    closed = true
    removeShutdownHooks?.()
    removeShutdownHooks = undefined
    const errors: unknown[] = []
    if (server) {
      try {
        await server.stop(true)
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      await closeApplication(signal)
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Bun runtime shutdown failed')
    }
  }

  const serve = async (
    serveOptions: BunServeOptions = {},
  ): Promise<BunListenerHandle> => {
    if (closed) {
      throw new Error('LUTRE_APP_STOPPED: Application is stopped.')
    }
    if (serving) {
      throw new Error(
        'LUTRE_RUNTIME_ALREADY_SERVING: Bun runtime Application is already serving.',
      )
    }
    if (!bun?.serve) {
      await close().catch(() => undefined)
      throw new Error('LUTRE_BUN_UNAVAILABLE: Bun.serve() is not available.')
    }
    serving = true
    try {
      const requestedPort = serveOptions.port
      let port = requestedPort ?? 3000
      while (true) {
        try {
          server = bun.serve({
            port,
            ...(serveOptions.hostname === undefined
              ? {}
              : { hostname: serveOptions.hostname }),
            fetch: createBunFetchDriver(http),
          })
          break
        } catch (error) {
          if (requestedPort !== undefined || !canRetryOnNextPort(error, port)) {
            throw error
          }
          port += 1
        }
      }

      presentation.ready({
        server: serverUrl(serveOptions.hostname, port),
        runtime: `Bun ${bun.version ?? 'unknown'}`,
        environment: environment.NODE_ENV ?? 'development',
        startupDurationMs: performance.now() - startedAt,
      })
      removeShutdownHooks =
        serveOptions.shutdownHooks === false
          ? undefined
          : registerBunShutdownHooks(close)
      return { port }
    } catch (error) {
      await close().catch(() => undefined)
      throw error
    }
  }

  Object.assign(application, { serve, close })
  return application
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

interface BunHttpRequestHandler {
  initialize?(): Promise<void>
  fetch(request: Request): Promise<Response>
}

function createBunFetchDriver(application: BunHttpRequestHandler) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize?.() ?? Promise.resolve()
    await initialization
    return application.fetch(request)
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
