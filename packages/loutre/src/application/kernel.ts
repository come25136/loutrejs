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
import {
  ApplicationKernelRuntime,
  type ApplicationKernelRuntimeOptions,
} from '../runtime/index.js'
import type {
  ApplicationDefinition,
  ApplicationExtensionHostApis,
} from './index.js'

export interface KernelApplicationBase extends AsyncDisposable {
  readonly graph: ApplicationModelGraphIR
  init(): Promise<this>
  get<TToken extends TokenLike>(token: TToken): TokenValue<TToken>
  close(signal?: string): Promise<void>
}

export type KernelHostedApplication<TDefinition extends ApplicationDefinition> =
  KernelApplicationBase & ApplicationExtensionHostApis<TDefinition>

export interface KernelApplicationOptions<
  TDefinition extends ApplicationDefinition,
> extends ApplicationKernelRuntimeOptions {
  readonly application: TDefinition
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
  readonly environment?: unknown
  readonly arguments?: unknown
}

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
  const application: Record<PropertyKey, unknown> = {
    graph: projectApplicationModel(options.application.model),
    async init() {
      await runtime.initialize()
      if (!initialized) {
        for (const modelExtension of options.application.model.extensions) {
          const host = modelExtension.extension.host
          if (!host) continue
          application[host.namespace] = host.create({
            executions: modelExtension.executions as never,
            runtime: runtime.extensionRuntime(modelExtension.extension),
            applicationRuntime: runtime,
          })
        }
        initialized = true
      }
      return application
    },
    get(token: TokenLike) {
      return runtime.get(token)
    },
    close(signal?: string) {
      return runtime.shutdown(signal)
    },
    [Symbol.asyncDispose]() {
      return runtime.shutdown()
    },
  }
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
