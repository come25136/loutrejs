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
import { serverUrl } from '../runtime/server-url.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : never

export type DenoRuntimeOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export type DenoServeOptions<TDefinition extends ApplicationDefinition> =
  DenoRuntimeOptions<TDefinition> & {
    readonly port?: number
    readonly hostname?: string
    readonly shutdownHooks?: boolean
  }

export interface DenoBinding {
  fetch(request: Request): Promise<Response>
  close(signal?: string): Promise<void>
}

export interface DenoServeHandle<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> {
  readonly application: HostBindingApplication<TDefinition>
  readonly port: number
  close(signal?: string): Promise<void>
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
  serve,
} as const

function bind<const TDefinition extends ApplicationDefinition>(
  options: DenoRuntimeOptions<TDefinition>,
): DenoBinding {
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

async function serve<const TDefinition extends ApplicationDefinition>(
  options: DenoServeOptions<TDefinition>,
): Promise<DenoServeHandle<TDefinition>> {
  const deno = denoGlobal()
  if (!deno?.serve) {
    throw new Error('LUTRE_DENO_UNAVAILABLE: Deno.serve() is not available.')
  }
  const startedAt = performance.now()
  const isTTY = deno.stdout?.isTerminal?.() === true
  const presentation = startStartupPresentation(
    { version: LOUTRE_VERSION },
    {
      terminal: {
        isTTY,
        color: isTTY && deno.env?.get?.('NO_COLOR') === undefined,
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
      'LUTRE_RUNTIME_HTTP_REQUIRED: denoRuntime.serve() requires an HTTP-capable Application.',
    )
  }

  await host.application.init()
  if ('triggers' in host.application) await host.application.triggers.start()
  let server: { shutdown(): Promise<void> }
  const requestedPort = options.port
  let port = requestedPort ?? 3000
  while (true) {
    try {
      server = deno.serve(
        {
          port,
          ...(options.hostname === undefined
            ? {}
            : { hostname: options.hostname }),
          onListen: () => undefined,
        },
        createDenoFetchDriver(http),
      )
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
    runtime: `Deno ${deno.version?.deno ?? 'unknown'}`,
    environment:
      deno.env?.get?.('DENO_ENV') ??
      deno.env?.get?.('NODE_ENV') ??
      'development',
    startupDurationMs: performance.now() - startedAt,
  })
  let closed = false
  const closeRuntime = async (signal?: string): Promise<void> => {
    if (closed) return
    closed = true
    const errors: unknown[] = []
    try {
      await server.shutdown()
    } catch (error) {
      errors.push(error)
    }
    try {
      await host.application.close(signal)
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'Deno runtime shutdown failed')
  }
  const removeShutdownHooks =
    options.shutdownHooks === false
      ? undefined
      : registerDenoShutdownHooks(deno, closeRuntime)
  const close = async (signal?: string): Promise<void> => {
    removeShutdownHooks?.()
    await closeRuntime(signal)
  }
  return { application: host.application, port, close }
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
