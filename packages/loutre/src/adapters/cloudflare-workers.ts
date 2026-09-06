import {
  binding,
  createKernelApplication,
  type ApplicationDefinition,
  type ApplicationExtensionHostApis,
  type BootstrapArguments,
  type HasHttp,
  type InvocationBinding,
  type InvocationBindingOptions,
  type KernelHostedApplication,
} from '../application/index.js'
import {
  applicationHasHost,
  bindApplicationCapability,
} from '../application/kernel-internal.js'
import type { HttpProtocolExecution } from '../legacy-http/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HasHttpExecutionExtension<TDefinition extends ApplicationDefinition> =
  'http' extends keyof ApplicationExtensionHostApis<TDefinition> ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : HasHttpExecutionExtension<TDefinition> extends true
        ? TDefinition
        : never

export type CloudflareWorkersBindOptions<
  TDefinition extends ApplicationDefinition,
> = {
  readonly application: HttpApplication<TDefinition>
} & BootstrapArguments<TDefinition>

export interface CloudflareWorkersBinding {
  fetch(
    request: Request,
    environment?: unknown,
    executionContext?: unknown,
  ): Promise<Response>
  close(signal?: string): Promise<void>
}

export const cloudflareWorkersRuntime = {
  runtime: 'cloudflare-workers',
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
  options: CloudflareWorkersBindOptions<TDefinition>,
): CloudflareWorkersBinding {
  assertRuntimeEngine('cloudflare-workers')

  if (applicationHasHost(options.application.model, 'http')) {
    let application: KernelHostedApplication<TDefinition> | undefined
    let initialization: Promise<unknown> | undefined
    const resolve = async (environment: unknown) => {
      application ??= createKernelApplication({
        application: options.application,
        capabilities: [
          bindApplicationCapability(options.application.model, 'http.server', {
            runtime: 'cloudflare-workers',
          }),
        ],
        environment,
        ...('arguments' in options ? { arguments: options.arguments } : {}),
      })
      initialization ??= application.init()
      await initialization
      return (
        application as unknown as {
          readonly http: CloudflareWorkersHttpRequestHandler
        }
      ).http
    }
    return {
      async fetch(request, environment) {
        return (await resolve(environment)).fetch(request)
      },
      async close(signal?: string) {
        await application?.close(signal)
      },
    }
  }

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
        'LUTRE_RUNTIME_HTTP_REQUIRED: cloudflareWorkersRuntime.bind() requires an HTTP-capable Application.',
      )
    }
    fetch = createCloudflareWorkersFetchDriver({
      initialize: () => http.initialize(),
      fetch: (request) => http.handle(request),
    })
    return { invocation, fetch }
  }

  return {
    async fetch(request, environment) {
      return resolve(environment).fetch(request)
    },
    async close(signal?: string) {
      await invocation?.application.close(signal)
    },
  }
}

interface CloudflareWorkersHttpRequestHandler {
  initialize?(): Promise<void>
  fetch(request: Request): Promise<Response>
}

function createCloudflareWorkersFetchDriver(
  application: CloudflareWorkersHttpRequestHandler,
) {
  let initialization: Promise<void> | undefined
  return async (request: Request): Promise<Response> => {
    initialization ??= application.initialize?.() ?? Promise.resolve()
    await initialization
    return application.fetch(request)
  }
}
