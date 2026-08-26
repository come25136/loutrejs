import {
  loadEnv,
  normalizeProvider,
  type EnvClass,
  type EntrypointArguments,
  type EntrypointDescriptor,
  type EntrypointOutput,
  type LifecycleHook,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type PipelineItem,
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
  readonly environmentSource?: unknown
  readonly entrypoints?: readonly EntrypointDescriptor<any, any>[]
}

export interface InitializableApplication {
  initialize(): Promise<void>
}

const NO_ENVIRONMENT_SOURCE = Symbol('loutre.no-environment-source')
let currentEnvironmentSource: unknown = NO_ENVIRONMENT_SOURCE

export function initializeWithEnvironment(
  application: InitializableApplication,
  environmentSource: unknown,
): Promise<void> {
  const previous = currentEnvironmentSource
  currentEnvironmentSource = environmentSource
  try {
    return application.initialize()
  } finally {
    currentEnvironmentSource = previous
  }
}

export class EnvironmentBindingError extends Error {
  readonly code = 'LUTRE_ENV_003'

  constructor(environment: EnvClass, cause: unknown) {
    super(`Environment validation failed for ${environment.name}.`, { cause })
    this.name = 'EnvironmentBindingError'
  }
}

export class ApplicationRuntime {
  readonly graph: RuntimeModuleGraph
  readonly container: Container
  readonly #instancesByModule = new Map<ModuleInstance, unknown[]>()
  readonly #logger: Logger
  readonly #environmentSource: unknown
  readonly #entrypoints: ReadonlySet<EntrypointDescriptor<any, any>>
  #initialized = false
  #initializing: Promise<void> | undefined
  #prepared = false
  #state: 'created' | 'initializing' | 'running' | 'stopping' | 'stopped' = 'created'
  #activeExecutions = 0
  readonly #idleWaiters = new Set<() => void>()
  #shutdown: Promise<void> | undefined

  constructor(
    roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
    options: ApplicationRuntimeOptions = {},
  ) {
    this.#logger = options.logger ?? new Logger()
    this.#environmentSource =
      'environmentSource' in options
        ? options.environmentSource
        : NO_ENVIRONMENT_SOURCE
    this.#entrypoints = new Set(options.entrypoints ?? [])
    this.graph = collectRuntimeModuleGraph(roots)
    this.container = new Container(this.graph.providers, {
      logger: this.#logger,
    })
  }

  initialize(): Promise<void> {
    if (this.#initialized) return Promise.resolve()
    if (this.#initializing) return this.#initializing
    if (this.#state === 'stopping') {
      return Promise.reject(applicationStateError('LUTRE_APP_STOPPING'))
    }
    if (this.#state === 'stopped') {
      return Promise.reject(applicationStateError('LUTRE_APP_STOPPED'))
    }

    const source =
      this.#environmentSource === NO_ENVIRONMENT_SOURCE
        ? currentEnvironmentSource
        : this.#environmentSource
    const initialization = this.#initialize(source).finally(() => {
      if (this.#initializing === initialization) {
        this.#initializing = undefined
      }
    })
    this.#initializing = initialization
    return initialization
  }

  async #initialize(environmentSource: unknown): Promise<void> {
    this.#state = 'initializing'
    try {
      await this.#bindEnvironment(environmentSource)
      this.#prepareRuntime()

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
      if ((this.#state as string) !== 'stopping') this.#state = 'running'
    } catch (error) {
      const cleanupErrors = await this.#rollbackInitialization()
      this.#state = 'stopped'
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Application initialization failed and rollback cleanup also failed',
        )
      }
      throw error
    }
  }

  async #bindEnvironment(source: unknown): Promise<void> {
    const environmentProviders = this.graph.providers.filter(
      (provider) => provider.kind === 'environment',
    )

    if (environmentProviders.length === 0) return

    if (source === NO_ENVIRONMENT_SOURCE) {
      throw new Error(
        'LUTRE_ENV_005: Application declares Environment Contracts, but the Runtime did not provide an Environment source.',
      )
    }

    for (const provider of environmentProviders) {
      try {
        const value = await loadEnv(provider.provide, source)
        this.container.bindEnvironment(provider.provide, value)
      } catch (error) {
        throw new EnvironmentBindingError(provider.provide, error)
      }
    }
  }

  #prepareRuntime(): void {
    if (this.#prepared) return
    for (const module of this.graph.modules) {
      for (const implementation of module.definition.implementations ?? []) {
        this.container.prepareImplementation(implementation)
      }
    }
    for (const pipeline of collectApplicationPipelines(this.graph.modules)) {
      this.container.preparePipeline(pipeline)
    }
    for (const entrypoint of this.#entrypoints) {
      this.container.prepareEntrypoint(entrypoint)
    }
    this.#prepared = true
  }

  run<TEntrypoint extends EntrypointDescriptor<any, any>>(
    entrypoint: TEntrypoint,
    ...args: EntrypointArguments<TEntrypoint>
  ): Promise<EntrypointOutput<TEntrypoint>> {
    if (!this.#entrypoints.has(entrypoint)) {
      return Promise.reject(
        new Error(
          `LUTRE_APP_ENTRYPOINT_NOT_REGISTERED: Entrypoint ${entrypoint.name} is not registered in this Application.`,
        ),
      )
    }
    return this.execute(async () => {
      const runtime = this.container.entrypointRuntime(entrypoint)
      return Reflect.apply(runtime, undefined, args) as Promise<
        EntrypointOutput<TEntrypoint>
      >
    })
  }

  async execute<T>(execution: () => T | Promise<T>): Promise<T> {
    if (this.#state === 'stopping') throw applicationStateError('LUTRE_APP_STOPPING')
    if (this.#state === 'stopped') throw applicationStateError('LUTRE_APP_STOPPED')
    this.#activeExecutions += 1
    try {
      await this.initialize()
      return await execution()
    } finally {
      this.#activeExecutions -= 1
      if (this.#activeExecutions === 0) {
        for (const resolve of this.#idleWaiters) resolve()
        this.#idleWaiters.clear()
      }
    }
  }

  shutdown(signal?: string): Promise<void> {
    if (this.#state === 'stopped') return Promise.resolve()
    if (this.#shutdown) return this.#shutdown
    this.#state = 'stopping'
    const shutdown = this.#shutdownRuntime(signal)
    this.#shutdown = shutdown
    return shutdown
  }

  async #shutdownRuntime(signal?: string): Promise<void> {
    if (this.#initializing) {
      await this.#initializing.catch(() => undefined)
    }
    if (this.#activeExecutions > 0) {
      await new Promise<void>((resolve) => this.#idleWaiters.add(resolve))
    }
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
      this.#state = 'stopped'
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
      (provider): provider is ProviderDescriptor =>
        provider.scope === 'application' && provider.kind !== 'environment',
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

function applicationStateError(code: 'LUTRE_APP_STOPPING' | 'LUTRE_APP_STOPPED') {
  return new Error(
    code === 'LUTRE_APP_STOPPING'
      ? `${code}: Application is stopping and cannot accept new executions.`
      : `${code}: Application is stopped and cannot accept new executions.`,
  )
}

function collectApplicationPipelines(
  modules: readonly ModuleInstance[],
): readonly (readonly PipelineItem[])[] {
  const pipelines: (readonly PipelineItem[])[] = []
  for (const module of modules) {
    for (const implementation of module.definition.implementations ?? []) {
      for (const procedureName of implementation.procedures) {
        const procedure = implementation.contract.procedures[procedureName]
        const protocol = procedure?.protocols[implementation.protocol] as
          | {
              readonly pipeline?: readonly PipelineItem[]
              readonly definition?: {
                readonly pipeline?: readonly PipelineItem[]
              }
            }
          | undefined
        const pipeline = protocol?.pipeline ?? protocol?.definition?.pipeline
        if (pipeline) pipelines.push(pipeline)
      }
    }
  }
  return pipelines
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
