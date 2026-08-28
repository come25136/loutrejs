import {
  asModuleInstance,
  childPipelineOf,
  isArgsClass,
  isEnvClass,
  layerDefinitionOf,
  normalizeProvider,
  runInInjectionContext,
  tokenName,
  type ArgsClass,
  type Class,
  type DependencyConsumer,
  type EnvClass,
  type EntrypointConsumer,
  type ImplementationConsumer,
  type ImplementationDescriptor,
  type LayerConsumer,
  type LayerDescriptor,
  type LayerRuntime,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type PipelineItem,
  type TaskConsumer,
  type TaskDescriptor,
  type TaskRuntime,
  type TokenLike,
} from '../core/index.js'
import { Logger } from './logger.js'

export class DependencyResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyResolutionError'
  }
}

class GraphProbeBoundary extends Error {
  constructor(readonly source: string) {
    super(`Graph Probe reached runtime-dependent value: ${source}`)
    this.name = 'GraphProbeBoundary'
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
  readonly environment?: ReadonlyMap<EnvClass, object>
  readonly arguments?: ReadonlyMap<ArgsClass, object>
  readonly probe?: boolean
}

export function collectRuntimeModuleGraph(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): RuntimeModuleGraph {
  const modules: ModuleInstance[] = []
  const providers: ProviderDescriptor[] = []
  const environmentProviders = new Set<EnvClass>()
  const visited = new Set<ModuleInstance>()

  const visit = (moduleLike: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(moduleLike)
    if (visited.has(module)) return
    visited.add(module)

    for (const imported of module.definition.imports ?? []) visit(imported)
    modules.push(module)
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      if (provider.kind === 'environment') {
        if (environmentProviders.has(provider.provide)) continue
        environmentProviders.add(provider.provide)
      }
      providers.push(provider)
    }
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
  readonly #taskCache = new Map<
    TaskDescriptor<any, any>,
    TaskRuntime<any, any>
  >()
  readonly #taskConsumers = new Map<TaskDescriptor<any, any>, TaskConsumer>()
  readonly #layerCache = new Map<
    LayerDescriptor,
    LayerRuntime<object, readonly [], unknown>
  >()
  readonly #logger: Logger
  readonly #recorder: DependencyRecorder | undefined
  readonly #environment = new Map<EnvClass, object>()
  readonly #arguments = new Map<ArgsClass, object>()
  readonly #probe: boolean

  constructor(
    providers: readonly ProviderDescriptor[],
    options: Logger | ContainerOptions = {},
  ) {
    this.#logger =
      options instanceof Logger ? options : (options.logger ?? new Logger())
    this.#recorder = options instanceof Logger ? undefined : options.recorder
    this.#probe = options instanceof Logger ? false : (options.probe ?? false)

    if (!(options instanceof Logger)) {
      for (const [environment, value] of options.environment ?? []) {
        this.#environment.set(environment, value)
      }
      for (const [argumentsContract, value] of options.arguments ?? []) {
        this.#arguments.set(argumentsContract, value)
      }
    }

    for (const provider of providers) {
      const existing = this.#providers.get(provider.provide)
      if (existing) {
        if (
          existing.kind === provider.kind &&
          isRuntimeInputProvider(provider)
        ) {
          continue
        }
        if (
          isRuntimeInputProvider(existing) ||
          isRuntimeInputProvider(provider)
        ) {
          const source =
            existing.kind === 'arguments' || provider.kind === 'arguments'
              ? 'Arguments'
              : 'Environment'
          const code =
            source === 'Arguments' ? 'LUTRE_ARGS_001' : 'LUTRE_ENV_001'
          throw new DependencyResolutionError(
            `${code}: ${source} ${tokenName(provider.provide)} is runtime-managed and cannot also be declared as a normal provider.`,
          )
        }
        throw new DependencyResolutionError(
          `LUTRE_DI_DUPLICATE: Duplicate provider for ${tokenName(provider.provide)}`,
        )
      }
      this.#providers.set(provider.provide, provider)
    }
  }

  bindEnvironment(environment: EnvClass, value: object): void {
    const provider = this.#providers.get(environment)
    if (!provider || provider.kind !== 'environment') {
      throw new DependencyResolutionError(
        `LUTRE_ENV_002: ${environment.name} is not declared by any Module.environment.`,
      )
    }
    if (this.#applicationCache.has(environment)) {
      throw new DependencyResolutionError(
        `LUTRE_ENV_006: Environment ${environment.name} was already resolved and cannot be rebound.`,
      )
    }
    this.#environment.set(environment, value)
  }

  bindArguments(argumentsContract: ArgsClass, value: object): void {
    const provider = this.#providers.get(argumentsContract)
    if (!provider || provider.kind !== 'arguments') {
      throw new DependencyResolutionError(
        `LUTRE_ARGS_002: ${argumentsContract.name} is not declared by Application.arguments.`,
      )
    }
    if (this.#applicationCache.has(argumentsContract)) {
      throw new DependencyResolutionError(
        `LUTRE_ARGS_006: Arguments ${argumentsContract.name} was already resolved and cannot be rebound.`,
      )
    }
    this.#arguments.set(argumentsContract, value)
  }

  resolve<T>(token: TokenLike<T>): T {
    return this.#resolve(token)
  }

  probeClass<T>(target: Class<T>): T {
    try {
      return this.#instantiate(target, [target])
    } catch (error) {
      if (isGraphProbeBoundary(error)) {
        return createOpaqueProbeValue(target.name) as T
      }
      throw error
    }
  }

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

  implementationRuntime(implementation: ImplementationDescriptor): object {
    const cached = this.#implementationCache.get(implementation)
    if (!cached) {
      throw new DependencyResolutionError(
        `LUTRE_IMPL_NOT_PREPARED: Implementation ${implementation.name} is not prepared during application construction.`,
      )
    }
    return cached
  }

  prepareTask(task: TaskDescriptor): void {
    if (this.#taskCache.has(task)) return
    let consumer = this.#taskConsumers.get(task)
    if (!consumer) {
      consumer = {
        kind: 'task-consumer',
        id: `runtime-task:${this.#taskConsumers.size + 1}`,
        name: task.name,
      }
      this.#taskConsumers.set(task, consumer)
    }
    this.#constructTask(task, consumer, true)
  }

  taskRuntime<TInput, TOutput>(
    task: TaskDescriptor<TInput, TOutput>,
  ): TaskRuntime<TInput, TOutput> {
    const cached = this.#taskCache.get(task)
    if (!cached) {
      throw new DependencyResolutionError(
        `LUTRE_TASK_NOT_PREPARED: Task ${task.name} is not prepared during application construction.`,
      )
    }
    return cached as TaskRuntime<TInput, TOutput>
  }

  probeTask(task: TaskDescriptor, consumer: TaskConsumer): void {
    try {
      this.#constructTask(task, consumer, false)
    } catch (error) {
      if (isGraphProbeBoundary(error)) return
      throw error
    }
  }

  /** Graph v3互換compilerを残しているため、Taskを旧Entrypoint形式へ接続する。 */
  probeEntrypoint(task: TaskDescriptor, consumer: EntrypointConsumer): void {
    try {
      this.#constructTask(task, consumer, false)
    } catch (error) {
      if (error instanceof DependencyResolutionError) {
        throw new DependencyResolutionError(
          error.message
            .replace(
              'LUTRE_TASK_ASYNC_FACTORY',
              'LUTRE_ENTRYPOINT_ASYNC_FACTORY',
            )
            .replace(
              'LUTRE_TASK_FACTORY_RESULT',
              'LUTRE_ENTRYPOINT_FACTORY_RESULT',
            )
            .replace('Task ', 'Entrypoint '),
        )
      }
      throw error
    }
  }

  probeImplementation(
    implementation: ImplementationDescriptor,
    consumer: ImplementationConsumer,
  ): object {
    try {
      return this.#constructImplementation(implementation, consumer, false)
    } catch (error) {
      if (isGraphProbeBoundary(error)) {
        return createOpaqueProbeValue(implementation.name)
      }
      throw error
    }
  }

  preparePipeline(pipeline: readonly PipelineItem[]): void {
    for (const item of pipeline) {
      if (item.kind !== 'layer') continue
      const definition = layerDefinitionOf(item)
      this.#constructLayer(
        definition,
        {
          kind: 'layer-consumer',
          id: `runtime-layer:${definition.name}`,
          name: definition.name,
        },
        true,
      )
      const child = childPipelineOf(item)
      if (child) this.preparePipeline(child)
    }
  }

  layerRuntime(
    layer: LayerDescriptor,
  ): LayerRuntime<object, readonly [], unknown> {
    const cached = this.#layerCache.get(layer)
    if (!cached) {
      throw new DependencyResolutionError(
        `LUTRE_LAYER_NOT_PREPARED: Layer ${layer.name} is not prepared during application construction.`,
      )
    }
    return cached
  }

  probeLayer(layer: LayerDescriptor, consumer: LayerConsumer): void {
    try {
      this.#constructLayer(layer, consumer, false)
    } catch (error) {
      if (isGraphProbeBoundary(error)) return
      throw error
    }
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
      throw new DependencyResolutionError(
        `LUTRE_DI_CYCLE: 循環依存を検出しました: ${cycle}`,
      )
    }

    const provider = this.#providers.get(token)
    if (!provider) {
      if ((token as TokenLike) === (Logger as unknown as TokenLike)) {
        return this.#logger.child(source === undefined ? {} : { source }) as T
      }
      if (isEnvClass(token)) {
        throw new DependencyResolutionError(
          `LUTRE_ENV_002: ${token.name} is injected by ${source ?? 'Application'} but is not declared by any Module.environment.`,
        )
      }
      if (isArgsClass(token)) {
        throw new DependencyResolutionError(
          `LUTRE_ARGS_002: ${token.name} is injected by ${source ?? 'Application'} but is not declared by Application.arguments.`,
        )
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

        case 'environment': {
          if (this.#environment.has(provider.provide)) {
            return this.#environment.get(provider.provide)
          }
          if (this.#probe) return createOpaqueProbeValue(provider.provide.name)
          throw new DependencyResolutionError(
            `LUTRE_ENV_005: Environment ${provider.provide.name} requires a runtime Environment source before Application initialization.`,
          )
        }

        case 'arguments': {
          if (this.#arguments.has(provider.provide)) {
            return this.#arguments.get(provider.provide)
          }
          if (this.#probe) return createOpaqueProbeValue(provider.provide.name)
          throw new DependencyResolutionError(
            `LUTRE_ARGS_005: Arguments ${provider.provide.name} requires a runtime Arguments source before Application initialization.`,
          )
        }

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
          if (this.#probe) return Object.create(null)
          const input = this.#resolve(
            provider.select.contract,
            tokenName(provider.provide),
            lineage,
          ) as Record<string, unknown>
          const selected = input[provider.select.key]
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
      if (this.#probe && isGraphProbeBoundary(error)) {
        return createOpaqueProbeValue(tokenName(provider.provide))
      }
      throw error
    }
  }

  #instantiate<T>(target: Class<T>, lineage: readonly TokenLike[]): T {
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
              record: (
                recordedConsumer: DependencyConsumer,
                dependency: TokenLike,
              ) => this.#recorder!.record(recordedConsumer, dependency),
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

  #constructTask(
    task: TaskDescriptor,
    consumer: TaskConsumer | EntrypointConsumer,
    cache: boolean,
  ): TaskRuntime<any, any> {
    const cached = this.#taskCache.get(task)
    if (cache && cached) return cached
    const runtime = runInInjectionContext(
      {
        consumer,
        resolve: (token) => this.#resolve(token, task.name),
        ...(this.#recorder === undefined
          ? {}
          : {
              record: (
                recordedConsumer: DependencyConsumer,
                dependency: TokenLike,
              ) => this.#recorder!.record(recordedConsumer, dependency),
            }),
      },
      () => task.factory(),
    ) as unknown
    if (isThenable(runtime)) {
      throw new DependencyResolutionError(
        `LUTRE_TASK_ASYNC_FACTORY: Task ${task.name} factory must be synchronous.`,
      )
    }
    if (typeof runtime !== 'function') {
      throw new DependencyResolutionError(
        `LUTRE_TASK_FACTORY_RESULT: Task ${task.name} factory must return a runtime function.`,
      )
    }
    const normalized = runtime as TaskRuntime<any, any>
    if (cache) this.#taskCache.set(task, normalized)
    return normalized
  }
}

function isRuntimeInputProvider(
  provider: ProviderDescriptor,
): provider is Extract<
  ProviderDescriptor,
  { kind: 'environment' | 'arguments' }
> {
  return provider.kind === 'environment' || provider.kind === 'arguments'
}

function isGraphProbeBoundary(error: unknown): error is GraphProbeBoundary {
  return error instanceof GraphProbeBoundary
}

function createOpaqueProbeValue(source: string): object {
  const boundary = (operation: PropertyKey) =>
    new GraphProbeBoundary(`${source}.${String(operation)}`)

  return new Proxy(Object.create(null) as object, {
    get(_target, key) {
      throw boundary(key)
    },
    set(_target, key) {
      throw boundary(key)
    },
    has(_target, key) {
      throw boundary(key)
    },
    ownKeys() {
      throw boundary('*')
    },
    getOwnPropertyDescriptor(_target, key) {
      throw boundary(key)
    },
    defineProperty(_target, key) {
      throw boundary(key)
    },
    deleteProperty(_target, key) {
      throw boundary(key)
    },
    getPrototypeOf() {
      throw boundary('[[Prototype]]')
    },
    setPrototypeOf() {
      throw boundary('[[Prototype]]')
    },
  })
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) ||
      typeof value === 'function') &&
    typeof (value as { readonly then?: unknown }).then === 'function'
  )
}
