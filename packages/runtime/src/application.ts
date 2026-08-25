import {
  normalizeProvider,
  type LifecycleHook,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrejs/core'
import {
  collectRuntimeModuleGraph,
  Container,
  type RuntimeModuleGraph,
} from './di.js'
import { Logger } from './logger.js'

export interface ApplicationRuntimeOptions {
  readonly logger?: Logger
}

export class ApplicationRuntime {
  readonly graph: RuntimeModuleGraph
  readonly container: Container
  readonly #instancesByModule = new Map<ModuleInstance, unknown[]>()
  #initialized = false
  #stopped = false

  constructor(
    roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
    options: ApplicationRuntimeOptions = {},
  ) {
    this.graph = collectRuntimeModuleGraph(roots)
    this.container = new Container(this.graph.providers, {
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    })
  }

  async initialize(): Promise<void> {
    if (this.#initialized) return
    if (this.#stopped) throw new Error('停止済みApplicationは再初期化できません')

    try {
      for (const module of this.graph.modules) {
        const instances = await this.#resolveModuleProviders(module)
        this.#instancesByModule.set(module, instances)
        for (const instance of instances) await callLifecycle(instance, 'onModuleInit')
        await this.#runHook(module.definition.lifecycle?.onModuleInit)
      }
      for (const module of this.graph.modules) {
        for (const instance of this.#instancesByModule.get(module) ?? []) {
          await callLifecycle(instance, 'onApplicationBootstrap')
        }
        await this.#runHook(module.definition.lifecycle?.onApplicationBootstrap)
      }
      this.#initialized = true
    } catch (error) {
      const cleanupErrors = await this.#rollbackInitialization()
      this.#stopped = true
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Application initialization failed and rollback cleanup also failed',
        )
      }
      throw error
    }
  }

  async shutdown(signal?: string): Promise<void> {
    if (this.#stopped) return
    const errors: unknown[] = []
    const modules = [...this.graph.modules].reverse()
    try {
      for (const module of modules) {
        for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
          await collectCleanupError(
            () => callLifecycle(instance, 'onModuleDestroy'),
            errors,
          )
        }
        await collectCleanupError(
          () => this.#runHook(module.definition.lifecycle?.onModuleDestroy),
          errors,
        )
      }
      for (const module of modules) {
        for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
          await collectCleanupError(
            () => callLifecycle(instance, 'beforeApplicationShutdown', signal),
            errors,
          )
        }
        await collectCleanupError(
          () => this.#runHook(module.definition.lifecycle?.beforeApplicationShutdown),
          errors,
        )
      }
      for (const module of modules) {
        for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
          await collectCleanupError(
            () => callLifecycle(instance, 'onApplicationShutdown', signal),
            errors,
          )
        }
        await collectCleanupError(
          () => this.#runHook(module.definition.lifecycle?.onApplicationShutdown),
          errors,
        )
      }
    } finally {
      this.#stopped = true
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Application shutdown cleanup failed')
    }
  }

  async #rollbackInitialization(): Promise<unknown[]> {
    const errors: unknown[] = []
    const modules = [...this.#instancesByModule.keys()].reverse()
    for (const module of modules) {
      await collectCleanupError(
        () => this.#runHook(module.definition.lifecycle?.onModuleDestroy),
        errors,
      )
      for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
        await collectCleanupError(
          () => callLifecycle(instance, 'onModuleDestroy'),
          errors,
        )
      }
    }
    return errors
  }

  async #resolveModuleProviders(module: ModuleInstance): Promise<unknown[]> {
    const providers = (module.definition.providers ?? []).map(normalizeProvider)
    const applicationProviders = providers.filter(
      (provider): provider is ProviderDescriptor => provider.scope === 'application',
    )
    const instances: unknown[] = []
    this.#instancesByModule.set(module, instances)
    for (const provider of applicationProviders) {
      instances.push(this.container.resolve(provider.provide))
    }
    return instances
  }

  async #runHook(hook: LifecycleHook<any> | undefined): Promise<void> {
    if (!hook) return
    const dependencies = hook.inject.map((token: TokenLike) =>
      this.container.resolve(token),
    )
    await hook.run(...dependencies)
  }
}

async function collectCleanupError(
  cleanup: () => Promise<void>,
  errors: unknown[],
): Promise<void> {
  try {
    await cleanup()
  } catch (error) {
    errors.push(error)
  }
}

export function createApplicationRuntime(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
  options: ApplicationRuntimeOptions = {},
): ApplicationRuntime {
  return new ApplicationRuntime(roots, options)
}

async function callLifecycle(
  instance: unknown,
  method:
    | 'onModuleInit'
    | 'onApplicationBootstrap'
    | 'onModuleDestroy'
    | 'beforeApplicationShutdown'
    | 'onApplicationShutdown',
  signal?: string,
): Promise<void> {
  if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) return
  const candidate = (instance as Record<string, unknown>)[method]
  if (typeof candidate !== 'function') return
  await Reflect.apply(candidate, instance, signal === undefined ? [] : [signal])
}
