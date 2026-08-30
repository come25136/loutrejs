import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type HostBindingApplication,
  type InvocationBindingOptions,
} from '../application/index.js'
import type { HttpProtocolExecution } from '../http/index.js'
import { LOUTRE_VERSION, startStartupPresentation } from '../presentation.js'
import { assertRuntimeEngine } from '../runtime/engine.js'
import { serverUrl } from '../runtime/server-url.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : never

type DenoServer = { shutdown(): Promise<void> }

export type DenoRuntimeOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export type DenoCreateOptions<TDefinition extends ApplicationDefinition> =
  DenoRuntimeOptions<TDefinition>

export interface DenoServeOptions {
  readonly port?: number
  readonly hostname?: string
  readonly shutdownHooks?: boolean
}

export interface DenoBinding {
  fetch(request: Request): Promise<Response>
  close(signal?: string): Promise<void>
}

export interface DenoListenerHandle {
  readonly port: number
}

export type DenoRuntimeApplication<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> = HostBindingApplication<TDefinition> & {
  serve(options?: DenoServeOptions): Promise<DenoListenerHandle>
}

export const denoRuntime = {
  runtime: 'deno',
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
  bind,
  create,
} as const

function bind<const TDefinition extends ApplicationDefinition>(
  options: DenoRuntimeOptions<TDefinition>,
): DenoBinding {
  assertRuntimeEngine('deno')
  const invocation = binding.invocation(
    bindingOptions(
      options,
      denoEnvironment(),
    ) as InvocationBindingOptions<TDefinition>,
  )
  const http =
    'http' in invocation
      ? (invocation.http as HttpProtocolExecution)
      : undefined
  if (!http) {
    void invocation.application.close()
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: denoRuntime.bind() requires an HTTP-capable Application.',
    )
  }
  const fetch = createDenoFetchDriver(http)
  return {
    fetch,
    close: (signal) => invocation.application.close(signal),
  }
}

async function create<const TDefinition extends ApplicationDefinition>(
  options: DenoCreateOptions<TDefinition>,
): Promise<DenoRuntimeApplication<TDefinition>> {
  assertRuntimeEngine('deno')
  const deno = denoGlobal()
  const startedAt = performance.now()
  const isTTY = deno?.stdout?.isTerminal?.() === true
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: {
        isTTY,
        color: isTTY && deno?.env?.get?.('NO_COLOR') === undefined,
      },
      write: (value) => console.log(value),
    },
  )
  const host = binding.host(
    bindingOptions(
      options,
      denoEnvironment(),
    ) as InvocationBindingOptions<TDefinition>,
  )
  const http = 'http' in host ? (host.http as HttpProtocolExecution) : undefined
  if (!http) {
    await host.application.close()
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: denoRuntime.create() requires an HTTP-capable Application.',
    )
  }

  await host.application.init()

  const application = host.application as DenoRuntimeApplication<TDefinition>
  const closeApplication = host.application.close.bind(host.application)
  let server: DenoServer | undefined
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
        await server.shutdown()
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      await closeApplication(signal)
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'Deno runtime shutdown failed')
  }

  const serve = async (
    serveOptions: DenoServeOptions = {},
  ): Promise<DenoListenerHandle> => {
    if (closed) {
      throw new Error('LUTRE_APP_STOPPED: Application is stopped.')
    }
    if (serving) {
      throw new Error(
        'LUTRE_RUNTIME_ALREADY_SERVING: Deno runtime Application is already serving.',
      )
    }
    if (!deno?.serve) {
      await close().catch(() => undefined)
      throw new Error('LUTRE_DENO_UNAVAILABLE: Deno.serve() is not available.')
    }
    serving = true
    try {
      if ('triggers' in application) await application.triggers.start()

      const requestedPort = serveOptions.port
      let port = requestedPort ?? 3000
      while (true) {
        try {
          server = deno.serve(
            {
              port,
              ...(serveOptions.hostname === undefined
                ? {}
                : { hostname: serveOptions.hostname }),
              onListen: () => undefined,
            },
            createDenoFetchDriver(http),
          )
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
        runtime: `Deno ${deno.version?.deno ?? 'unknown'}`,
        environment:
          deno.env?.get?.('DENO_ENV') ??
          deno.env?.get?.('NODE_ENV') ??
          'development',
        startupDurationMs: performance.now() - startedAt,
      })
      removeShutdownHooks =
        serveOptions.shutdownHooks === false
          ? undefined
          : registerDenoShutdownHooks(deno, close)
      return { port }
    } catch (error) {
      await close().catch(() => undefined)
      throw error
    }
  }

  Object.assign(application, { serve, close })
  return application
}

function registerDenoShutdownHooks(
  deno: NonNullable<ReturnType<typeof denoGlobal>>,
  close: (signal: string) => Promise<void>,
): (() => void) | undefined {
  if (!deno.addSignalListener || !deno.removeSignalListener) {
    return undefined
  }
  const handlers = new Map<'SIGINT' | 'SIGTERM', () => void>()
  const remove = () => {
    for (const [signal, handler] of handlers) {
      deno.removeSignalListener?.(signal, handler)
    }
    handlers.clear()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      remove()
      void close(signal)
    }
    handlers.set(signal, handler)
    deno.addSignalListener(signal, handler)
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

function createDenoFetchDriver(application: HttpProtocolExecution) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize()
    await initialization
    return application.handle(request)
  }
}

function bindingOptions<TDefinition extends ApplicationDefinition>(
  options: DenoRuntimeOptions<TDefinition>,
  environment: unknown,
): object {
  return {
    application: options.application,
    environment: 'environment' in options ? options.environment : environment,
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  }
}

function denoEnvironment(): unknown {
  const deno = denoGlobal()
  return deno?.env?.toObject ? deno.env.toObject() : undefined
}

function denoGlobal():
  | {
      env?: {
        get?(name: string): string | undefined
        toObject?(): Record<string, string>
      }
      stdout?: { isTerminal?(): boolean }
      version?: { deno?: string }
      addSignalListener?(signal: string, handler: () => void): void
      removeSignalListener?(signal: string, handler: () => void): void
      serve?(
        options: {
          port: number
          hostname?: string
          onListen?: () => void
        },
        handler: (request: Request) => Response | Promise<Response>,
      ): { shutdown(): Promise<void> }
    }
  | undefined {
  return (globalThis as typeof globalThis & { Deno?: unknown }).Deno as
    | {
        env?: {
          get?(name: string): string | undefined
          toObject?(): Record<string, string>
        }
        stdout?: { isTerminal?(): boolean }
        version?: { deno?: string }
        addSignalListener?(signal: string, handler: () => void): void
        removeSignalListener?(signal: string, handler: () => void): void
        serve?(
          options: {
            port: number
            hostname?: string
            onListen?: () => void
          },
          handler: (request: Request) => Response | Promise<Response>,
        ): { shutdown(): Promise<void> }
      }
    | undefined
}
