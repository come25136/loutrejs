/// <reference lib="esnext.disposable" preserve="true" />

import type {
  RuntimeCapabilityBinding,
  TokenLike,
  TokenValue,
} from '../core/index.js'
import {
  projectApplicationModel,
  type ApplicationModelGraphIR,
} from '../graph/index.js'
import { ApplicationKernelRuntime, type Logger } from '../runtime/index.js'
import type {
  ApplicationDefinition,
  ApplicationExtensionHostApis,
  BootstrapArguments,
} from './index.js'

export interface KernelApplicationBase extends AsyncDisposable {
  readonly graph: ApplicationModelGraphIR
  init(): Promise<this>
  get<TToken extends TokenLike>(token: TToken): TokenValue<TToken>
  close(signal?: string): Promise<void>
}

export type KernelHostedApplication<TDefinition extends ApplicationDefinition> =
  KernelApplicationBase & ApplicationExtensionHostApis<TDefinition>

export type KernelApplicationOptions<
  TDefinition extends ApplicationDefinition,
> = {
  readonly application: TDefinition
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
  readonly environment?: unknown
  readonly logger?: Logger
  readonly forceShutdownTimeoutMs?: number
} & BootstrapArguments<TDefinition>

export function createKernelApplication<
  const TDefinition extends ApplicationDefinition,
>(
  options: KernelApplicationOptions<TDefinition>,
): KernelHostedApplication<TDefinition> {
  const logger = options.logger ?? options.application.logger
  const runtime = new ApplicationKernelRuntime(options.application.model, {
    ...options,
    ...(logger === undefined ? {} : { logger }),
    ...('environment' in options
      ? { environmentSource: options.environment }
      : {}),
    ...('arguments' in options ? { argumentsSource: options.arguments } : {}),
  })
  let initialized = false
  const application: Record<PropertyKey, unknown> = Object.assign(
    Object.create(null) as Record<PropertyKey, unknown>,
    {
      graph: projectApplicationModel(options.application.model),
      async init() {
        await runtime.initialize()
        if (initialized) return application

        const createdNamespaces: string[] = []
        try {
          for (const modelExtension of options.application.model.extensions) {
            const host = modelExtension.extension.host
            if (!host) continue
            application[host.namespace] = host.create({
              executions: modelExtension.executions,
              runtime: runtime.extensionRuntime(modelExtension.extension),
              applicationRuntime: runtime,
            })
            createdNamespaces.push(host.namespace)
          }
          initialized = true
          return application
        } catch (error) {
          for (const namespace of createdNamespaces)
            delete application[namespace]
          try {
            await runtime.shutdown()
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              'Host API creation failed and runtime rollback also failed.',
              { cause: cleanupError },
            )
          }
          throw error
        }
      },
      get(token: TokenLike) {
        return runtime.get(token)
      },
      close(signal?: string) {
        return runtime.shutdown(signal)
      },
      [Symbol.asyncDispose]() {
        return (
          application as unknown as Pick<KernelApplicationBase, 'close'>
        ).close()
      },
    },
  )
  return application as KernelHostedApplication<TDefinition>
}

export async function bootstrapApplication<
  const TDefinition extends ApplicationDefinition,
>(
  options: KernelApplicationOptions<TDefinition>,
): Promise<KernelHostedApplication<TDefinition>> {
  const application = createKernelApplication(options)
  await application.init()
  return application
}
