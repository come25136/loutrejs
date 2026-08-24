import {
  normalizeProvider,
  type LifecycleHook,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrefw/core'
import {
  collectRuntimeModuleGraph,
  Container,
  type RuntimeModuleGraph,
} from './di.js'

export interface ApplicationRuntimeOptions {
  readonly constructorDependencies?: ReadonlyMap<Function, readonly import('@loutrefw/core').TokenLike[]>
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
    this.container = new Container(this.graph.providers, options)
  }

  async initialize(): Promise<void> {
    if (this.#initialized) return
    if (this.#stopped) throw new Error('停止済みApplicationは再初期化できません')

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
  }

  async shutdown(signal?: string): Promise<void> {
    if (this.#stopped) return
    const modules = [...this.graph.modules].reverse()
    for (const module of modules) {
      for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
        await callLifecycle(instance, 'onModuleDestroy')
      }
      await this.#runHook(module.definition.lifecycle?.onModuleDestroy)
    }
    for (const module of modules) {
      for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
        await callLifecycle(instance, 'beforeApplicationShutdown', signal)
      }
      await this.#runHook(module.definition.lifecycle?.beforeApplicationShutdown)
    }
    for (const module of modules) {
      for (const instance of [...(this.#instancesByModule.get(module) ?? [])].reverse()) {
        await callLifecycle(instance, 'onApplicationShutdown', signal)
      }
      await this.#runHook(module.definition.lifecycle?.onApplicationShutdown)
    }
    this.#stopped = true
  }

  async #resolveModuleProviders(module: ModuleInstance): Promise<unknown[]> {
    const providers = (module.definition.providers ?? []).map(normalizeProvider)
    const applicationProviders = providers.filter(
      (provider): provider is ProviderDescriptor => provider.scope === 'application',
    )
    return Promise.all(
      applicationProviders.map((provider) =>
        this.container.resolve(provider.provide),
      ),
    )
  }

  async #runHook(hook: LifecycleHook<any> | undefined): Promise<void> {
    if (!hook) return
    const dependencies = await Promise.all(
      hook.inject.map((token: TokenLike) => this.container.resolve(token)),
    )
    await hook.run(...dependencies)
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
