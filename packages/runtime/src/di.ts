import {
  asModuleInstance,
  childPipelineOf,
  layerDefinitionOf,
  normalizeProvider,
  runInInjectionContext,
  tokenName,
  type Class,
  type DependencyConsumer,
  type ImplementationConsumer,
  type ImplementationDescriptor,
  type LayerConsumer,
  type LayerDescriptor,
  type LayerRuntime,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type PipelineItem,
  type TokenLike,
} from '@loutrejs/core'
import { Logger } from './logger.js'

export class DependencyResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyResolutionError'
  }
}

export interface RuntimeModuleGraph {
  readonly modules: readonly ModuleInstance[]
  readonly providers: readonly ProviderDescriptor[]
}

export interface DependencyRecorder {
  record(consumer: DependencyConsumer, dependency: TokenLike): void
}

export interface ContainerOptions {
  readonly logger?: Logger
  readonly recorder?: DependencyRecorder
}

export function collectRuntimeModuleGraph(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): RuntimeModuleGraph {
  const modules: ModuleInstance[] = []
  const providers: ProviderDescriptor[] = []
  const visited = new Set<ModuleInstance>()

  const visit = (moduleLike: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(moduleLike)
    if (visited.has(module)) return
    visited.add(module)

    for (const imported of module.definition.imports ?? []) visit(imported)
    modules.push(module)
    providers.push(...(module.definition.providers ?? []).map(normalizeProvider))
  }

  for (const root of roots) visit(root)
  return { modules, providers }
}

export class Container {
  readonly #providers = new Map<TokenLike, ProviderDescriptor>()
  readonly #applicationCache = new Map<TokenLike, unknown>()
  readonly #implementationCache = new Map<ImplementationDescriptor, object>()
  readonly #implementationConsumers = new Map<
    ImplementationDescriptor,
    ImplementationConsumer
  >()
  readonly #layerCache = new Map<LayerDescriptor, LayerRuntime<object, readonly [], unknown>>()
  readonly #logger: Logger
  readonly #recorder: DependencyRecorder | undefined

  constructor(
    providers: readonly ProviderDescriptor[],
    options: Logger | ContainerOptions = {},
  ) {
    this.#logger = options instanceof Logger ? options : options.logger ?? new Logger()
    this.#recorder = options instanceof Logger ? undefined : options.recorder
    for (const provider of providers) {
      if (this.#providers.has(provider.provide)) {
        throw new DependencyResolutionError(
          `LUTRE_DI_DUPLICATE: Duplicate provider for ${tokenName(provider.provide)}`,
        )
      }
      this.#providers.set(provider.provide, provider)
    }
  }

  resolve<T>(token: TokenLike<T>): T {
    return this.#resolve(token)
  }

  /** @internal Graph Probe がProvider classをconstructionする。 */
  probeClass<T>(target: Class<T>): T {
    return this.#instantiate(target, [target])
  }

  /** @internal Application construction時にImplementation factoryを1回だけ構築する。 */
  prepareImplementation(implementation: ImplementationDescriptor): void {
    if (this.#implementationCache.has(implementation)) return
    let consumer = this.#implementationConsumers.get(implementation)
    if (!consumer) {
      consumer = {
        kind: 'implementation-consumer',
        id: `runtime-implementation:${this.#implementationConsumers.size + 1}`,
        name: implementation.name,
      }
      this.#implementationConsumers.set(implementation, consumer)
    }
    this.#constructImplementation(implementation, consumer, true)
  }

  /** @internal 構築済みImplementation runtimeを取得する。 */
  implementationRuntime(
    implementation: ImplementationDescriptor,
  ): object {
    const cached = this.#implementationCache.get(implementation)
    if (!cached) {
      throw new DependencyResolutionError(
        `LUTRE_IMPL_NOT_PREPARED: Implementation ${implementation.name} is not prepared during application construction.`,
      )
    }
    return cached
  }

  /** @internal Graph Probe用にImplementation factoryを同期constructionする。 */
  probeImplementation(
    implementation: ImplementationDescriptor,
    consumer: ImplementationConsumer,
  ): object {
    return this.#constructImplementation(implementation, consumer, false)
  }

  /** @internal Application construction時にLayer factoryを1回だけ構築する。 */
  preparePipeline(pipeline: readonly PipelineItem[]): void {
    for (const item of pipeline) {
      if (item.kind !== 'layer') continue
      const definition = layerDefinitionOf(item)
      this.#constructLayer(definition, {
        kind: 'layer-consumer',
        id: `runtime-layer:${definition.name}`,
        name: definition.name,
      }, true)
      const child = childPipelineOf(item)
      if (child) this.preparePipeline(child)
    }
  }

  /** @internal 構築済みLayer runtimeを取得する。 */
  layerRuntime(layer: LayerDescriptor): LayerRuntime<object, readonly [], unknown> {
    const cached = this.#layerCache.get(layer)
    if (!cached) {
      throw new DependencyResolutionError(
        `LUTRE_LAYER_NOT_PREPARED: Layer ${layer.name} is not prepared during application construction.`,
      )
    }
    return cached
  }

  /** @internal Graph Probe用にLayer factoryを同期constructionする。 */
  probeLayer(layer: LayerDescriptor, consumer: LayerConsumer): void {
    this.#constructLayer(layer, consumer, false)
  }

  #resolve<T>(
    token: TokenLike<T>,
    source?: string,
    lineage: readonly TokenLike[] = [],
  ): T {
    const cycleStart = lineage.indexOf(token)
    if (cycleStart >= 0) {
      const cycle = [...lineage.slice(cycleStart), token]
        .map(tokenName)
        .join(' -> ')
      throw new DependencyResolutionError(`LUTRE_DI_CYCLE: 循環依存を検出しました: ${cycle}`)
    }
    const provider = this.#providers.get(token)
    if (!provider) {
      if (
        (token as TokenLike) === (Logger as unknown as TokenLike)
      ) {
        return this.#logger.child({
          ...(source === undefined ? {} : { source }),
        }) as T
      }
      throw new DependencyResolutionError(
        `LUTRE_DI_UNRESOLVED: ${source ?? 'Application'} requires ${tokenName(token)}, but no provider is declared for ${tokenName(token)}.`,
      )
    }

    const nextLineage = [...lineage, token]
    if (provider.scope !== 'application') {
      return this.#create(provider, nextLineage) as T
    }

    const cached = this.#applicationCache.get(token)
    if (this.#applicationCache.has(token)) return cached as T

    const instance = this.#create(provider, nextLineage)
    this.#applicationCache.set(token, instance)
    return instance as T
  }

  #create(
    provider: ProviderDescriptor,
    lineage: readonly TokenLike[],
  ): unknown {
    try {
      switch (provider.kind) {
      case 'value':
        return provider.useValue
      case 'class':
        return this.#instantiate(provider.useClass, lineage)
      case 'factory': {
        const dependencies = provider.inject.map((token) =>
          this.#resolve(token, tokenName(provider.provide), lineage),
        )
        const value = provider.useFactory(...dependencies)
        if (isThenable(value)) {
          throw new DependencyResolutionError(
            'LUTRE_DI_ASYNC_FACTORY: Async factory providers are not supported. Move asynchronous resource initialization to application lifecycle.',
          )
        }
        return value
      }
      case 'conditional': {
        const env = this.#resolve(
          provider.select.env,
          tokenName(provider.provide),
          lineage,
        ) as Record<
          string,
          unknown
        >
        const selected = env[provider.select.key]
        const implementation = provider.mapping[selected as PropertyKey]
        if (!implementation) {
          throw new DependencyResolutionError(
            `${provider.select.key}=${String(selected)}に対応するconditional Providerがありません`,
          )
        }
        return this.#instantiate(implementation, lineage)
      }
      }
    } catch (error) {
      if (provider.scope === 'application') {
        this.#applicationCache.delete(provider.provide)
      }
      throw error
    }
  }

  #instantiate<T>(
    target: Class<T>,
    lineage: readonly TokenLike[],
  ): T {
    if (target.length > 0) {
      throw new DependencyResolutionError(
        `LUTRE_DI_CONSTRUCTOR: ${target.name} has required constructor parameters. Declare framework dependencies with constructor default parameters using inject().`,
      )
    }
    return runInInjectionContext(
      {
        consumer: target,
        resolve: (token) => this.#resolve(token, target.name, lineage),
        ...(this.#recorder === undefined
          ? {}
          : {
              record: (consumer: DependencyConsumer, dependency: TokenLike) =>
                this.#recorder!.record(consumer, dependency),
            }),
      },
      () => new target(),
    )
  }

  #constructLayer(
    layer: LayerDescriptor,
    consumer: LayerConsumer,
    cache: boolean,
  ): LayerRuntime<object, readonly [], unknown> {
    const cached = this.#layerCache.get(layer)
    if (cache && cached) return cached
    const runtime = runInInjectionContext(
      {
        consumer,
        resolve: (token) => this.#resolve(token, layer.name),
        ...(this.#recorder === undefined
          ? {}
          : {
              record: (recordedConsumer: DependencyConsumer, dependency: TokenLike) =>
                this.#recorder!.record(recordedConsumer, dependency),
            }),
      },
      () => layer.factory(),
    )
    if (isThenable(runtime)) {
      throw new DependencyResolutionError(
        `LUTRE_LAYER_ASYNC_FACTORY: Layer ${layer.name} factory must be synchronous.`,
      )
    }
    if (typeof runtime !== 'function') {
      throw new DependencyResolutionError(
        `LUTRE_LAYER_FACTORY_RESULT: Layer ${layer.name} factory must return a runtime function.`,
      )
    }
    const normalized = runtime as LayerRuntime<object, readonly [], unknown>
    if (cache) this.#layerCache.set(layer, normalized)
    return normalized
  }

  #constructImplementation(
    implementation: ImplementationDescriptor,
    consumer: ImplementationConsumer,
    cache: boolean,
  ): object {
    const cached = this.#implementationCache.get(implementation)
    if (cache && cached) return cached
    const runtime = runInInjectionContext(
      {
        consumer,
        resolve: (token) => this.#resolve(token, implementation.name),
        ...(this.#recorder === undefined
          ? {}
          : {
              record: (
                recordedConsumer: DependencyConsumer,
                dependency: TokenLike,
              ) => this.#recorder!.record(recordedConsumer, dependency),
            }),
      },
      () => implementation.factory(),
    ) as unknown
    if (isThenable(runtime)) {
      throw new DependencyResolutionError(
        `LUTRE_IMPL_ASYNC_FACTORY: Implementation ${implementation.name} factory must be synchronous.`,
      )
    }
    if (
      typeof runtime !== 'object' ||
      runtime === null ||
      Array.isArray(runtime)
    ) {
      throw new DependencyResolutionError(
        `LUTRE_IMPL_FACTORY_RESULT: Implementation ${implementation.name} factory must return a non-null object.`,
      )
    }
    const normalized = runtime as Record<string, unknown>
    for (const procedure of implementation.procedures) {
      if (typeof normalized[procedure] !== 'function') {
        throw new DependencyResolutionError(
          `LUTRE_IMPL_004: Implementation ${implementation.name} does not implement callable procedure ${procedure}.`,
        )
      }
    }
    if (cache) this.#implementationCache.set(implementation, normalized)
    return normalized
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  ) && typeof (value as { readonly then?: unknown }).then === 'function'
}
