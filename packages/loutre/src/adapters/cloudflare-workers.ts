import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type KernelHostedApplication,
  type RequireApplicationExtension,
} from '../application/index.js'
import type { RuntimeCapabilityBinding } from '../core/index.js'
import { bindApplicationCapability } from '../application/kernel-internal.js'
import { httpExecutionExtension } from '../http/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

type HttpApplication<TDefinition extends ApplicationDefinition> =
  RequireApplicationExtension<TDefinition, typeof httpExecutionExtension>

export type CloudflareWorkersBindOptions<
  TDefinition extends ApplicationDefinition,
> = {
  readonly application: HttpApplication<TDefinition>
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
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
  if (
    options.application.model.extensions.get(httpExecutionExtension) ===
    undefined
  ) {
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: cloudflareWorkersRuntime.bind() requires the HTTP Execution Extension.',
    )
  }

  let application: KernelHostedApplication<TDefinition> | undefined
  let initialization: Promise<unknown> | undefined
  const resolve = async (environment: unknown) => {
    application ??= createKernelApplication<TDefinition>({
      ...options,
      application: options.application,
      capabilities: [
        bindApplicationCapability(options.application.model, 'http.server', {
          runtime: 'cloudflare-workers',
        }),
        ...(options.capabilities ?? []),
      ],
      environment,
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

interface CloudflareWorkersHttpRequestHandler {
  fetch(request: Request): Promise<Response>
}
