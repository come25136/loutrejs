import { createCloudflareWebSocketDriver } from './websocket-native.js'
import {
  serverTransportBindings,
  dispatchServerRequest,
} from './server-transports.js'
import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type KernelHostedApplication,
} from '../application/index.js'
import type { RuntimeCapabilityBinding } from '../core/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

export type CloudflareWorkersBindOptions<
  TDefinition extends ApplicationDefinition,
> = {
  readonly application: TDefinition
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
    'websocket.server',
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

  let application: KernelHostedApplication<TDefinition> | undefined
  let initialization: Promise<unknown> | undefined
  const resolve = async (environment: unknown) => {
    application ??= createKernelApplication<TDefinition>({
      ...options,
      application: options.application,
      capabilities: [
        ...serverTransportBindings(
          options.application.model,
          'cloudflare-workers',
          createCloudflareWebSocketDriver(),
        ),
        ...(options.capabilities ?? []),
      ],
      environment,
    })
    initialization ??= application.init()
    await initialization
    return application
  }

  return {
    async fetch(request, environment) {
      return dispatchServerRequest(await resolve(environment), request)
    },
    async close(signal?: string) {
      await application?.close(signal)
    },
  }
}
