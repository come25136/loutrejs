import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type InvocationBinding,
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

export type WorkerdBindOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
} & BootstrapArguments<TDefinition>

export interface WorkerdBinding {
  fetch(
    request: Request,
    environment?: unknown,
    executionContext?: unknown,
  ): Promise<Response>
  close(signal?: string): Promise<void>
}

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
  bind,
} as const

function bind<const TDefinition extends ApplicationDefinition>(
  options: WorkerdBindOptions<TDefinition>,
): WorkerdBinding {
  let invocation: InvocationBinding<TDefinition> | undefined
  let fetch: ((request: Request) => Promise<Response>) | undefined

  const resolve = (environment: unknown) => {
    if (invocation && fetch) return { invocation, fetch }
    invocation = binding.invocation({
      application: options.application,
      environment,
      ...('arguments' in options ? { arguments: options.arguments } : {}),
    } as unknown as InvocationBindingOptions<TDefinition>)
    const http =
      'http' in invocation
        ? (invocation.http as HttpProtocolExecution)
        : undefined
    if (!http) {
      void invocation.application.close()
      throw new Error(
        'LUTRE_RUNTIME_HTTP_REQUIRED: workerdRuntime.bind() requires an HTTP-capable Application.',
      )
    }
    fetch = createWorkerdFetchDriver(http)
    return { invocation, fetch }
  }

  return {
    async fetch(request, environment) {
      const resolved = resolve(environment)
      return resolved.fetch(request)
    },
    async close(signal?: string) {
      await invocation?.application.close(signal)
    },
  }
}

function createWorkerdFetchDriver(application: HttpProtocolExecution) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize()
    await initialization
    return application.handle(request)
  }
}
