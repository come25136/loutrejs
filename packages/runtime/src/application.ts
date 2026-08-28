import {
  argumentsProvider,
  loadArgs,
  loadEnv,
  normalizeProvider,
  type ArgsClass,
  type EnvClass,
  type LifecycleHook,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type PipelineItem,
  type TaskArguments,
  type TaskDescriptor,
  type TaskOutput,
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
  readonly arguments?: ArgsClass
  readonly argumentsSource?: unknown
  readonly tasks?: readonly TaskDescriptor<any, any>[]
  readonly publicTasks?: readonly TaskDescriptor<any, any>[]
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

export class ArgumentsBindingError extends Error {
  readonly code = 'LUTRE_ARGS_003'

  constructor(argumentsContract: ArgsClass, cause: unknown) {
    super(`Arguments validation failed for ${argumentsContract.name}.`, {
      cause,
    })
    this.name = 'ArgumentsBindingError'
  }
}

export class ApplicationRuntime {
  readonly graph: RuntimeModuleGraph
  readonly container: Container
  readonly #instancesByModule = new Map<ModuleInstance, unknown[]>()
  readonly #logger: Logger
  readonly #environmentSource: unknown
  readonly #arguments: ArgsClass | undefined
  readonly #argumentsSource: unknown
  readonly #tasks: ReadonlySet<TaskDescriptor<any, any>>
  readonly #publicTasks: ReadonlySet<TaskDescriptor<any, any>>
  #initialized = false
  #initializing: Promise<void> | undefined
  #prepared = false
  #state: 'created' | 'initializing' | 'running' | 'stopping' | 'stopped' =
    'created'
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
    this.#arguments = options.arguments
    this.#argumentsSource =
      'argumentsSource' in options ? options.argumentsSource : Object.freeze({})
    this.#tasks = new Set(options.tasks ?? [])
    this.#publicTasks = new Set(options.publicTasks ?? [])
    this.graph = collectRuntimeModuleGraph(roots)
    const providers = [
      ...this.graph.providers,
      ...(this.#arguments ? [argumentsProvider(this.#arguments)] : []),
    ]
    this.container = new Container(providers, {
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
      await this.#bindArguments()
      this.#prepareRuntime()

      for (const module of this.graph.modules) {
        const instances = await this.#resolveModuleProviders(module)
        this.#instancesByModule.set(module, instances)
        for (const instance of instances)
          await callLifecycle(instance, 'onModuleInit')
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
          { cause: error },
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

  async #bindArguments(): Promise<void> {
    if (!this.#arguments) return
    try {
      const value = await loadArgs(this.#arguments, this.#argumentsSource)
      this.container.bindArguments(this.#arguments, value)
    } catch (error) {
      throw new ArgumentsBindingError(this.#arguments, error)
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
    for (const task of this.#tasks) {
      this.container.prepareTask(task)
    }
    this.#prepared = true
  }

  run<TTask extends TaskDescriptor<any, any>>(
    task: TTask,
    ...args: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>> {
    if (!this.#publicTasks.has(task)) {
      return Promise.reject(
        new Error(
          `LUTRE_TASK_002: Task ${task.name} is not registered in Application.tasks.`,
        ),
      )
    }
    return this.#invokeTask(task, args)
  }

  /** @internal Trigger Host invokes registered non-public Tasks through this path. */
  runTask<TTask extends TaskDescriptor<any, any>>(
    task: TTask,
    ...args: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>> {
    if (!this.#tasks.has(task)) {
      return Promise.reject(
        new Error(
          `LUTRE_TASK_NOT_REGISTERED: Task ${task.name} is not registered in this Application.`,
        ),
      )
    }
    return this.#invokeTask(task, args)
  }

  #invokeTask<TTask extends TaskDescriptor<any, any>>(
    task: TTask,
    args: TaskArguments<TTask>,
  ): Promise<TaskOutput<TTask>> {
    return this.execute(async () => {
      const runtime = this.container.taskRuntime(task)
      return Reflect.apply(runtime, undefined, args) as Promise<
        TaskOutput<TTask>
      >
    })
  }

  async execute<T>(execution: () => T | Promise<T>): Promise<T> {
    if (this.#state === 'stopping')
      throw applicationStateError('LUTRE_APP_STOPPING')
    if (this.#state === 'stopped')
      throw applicationStateError('LUTRE_APP_STOPPED')
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

  /** @internal Application Hostがcleanup前に新規execution受付を同期的に閉じる。 */
  stopAcceptingExecutions(): void {
    if (this.#state !== 'stopped') this.#state = 'stopping'
  }

  shutdown(signal?: string): Promise<void> {
    if (this.#state === 'stopped') return Promise.resolve()
    if (this.#shutdown) return this.#shutdown
    this.stopAcceptingExecutions()
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
    const modules = this.graph.modules.toReversed()
    try {
      for (const module of modules) {
        for (const instance of (
          this.#instancesByModule.get(module) ?? []
        ).toReversed()) {
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
        for (const instance of (
          this.#instancesByModule.get(module) ?? []
        ).toReversed()) {
          await collectCleanupError(
            () => callLifecycle(instance, 'beforeApplicationShutdown', signal),
            errors,
          )
        }
        await collectCleanupError(
          () =>
            this.#runHook(
              module.definition.lifecycle?.beforeApplicationShutdown,
            ),
          errors,
        )
      }
      for (const module of modules) {
        for (const instance of (
          this.#instancesByModule.get(module) ?? []
        ).toReversed()) {
          await collectCleanupError(
            () => callLifecycle(instance, 'onApplicationShutdown', signal),
            errors,
          )
        }
        await collectCleanupError(
          () =>
            this.#runHook(module.definition.lifecycle?.onApplicationShutdown),
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
    const modules = [...this.#instancesByModule.keys()].toReversed()
    for (const module of modules) {
      await collectCleanupError(
        () => this.#runHook(module.definition.lifecycle?.onModuleDestroy),
        errors,
      )
      for (const instance of (
        this.#instancesByModule.get(module) ?? []
      ).toReversed()) {
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
        provider.scope === 'application' &&
        provider.kind !== 'environment' &&
        provider.kind !== 'arguments',
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

function applicationStateError(
  code: 'LUTRE_APP_STOPPING' | 'LUTRE_APP_STOPPED',
) {
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
  if (
    !instance ||
    (typeof instance !== 'object' && typeof instance !== 'function')
  )
    return
  const candidate = (instance as Record<string, unknown>)[method]
  if (typeof candidate !== 'function') return
  await Reflect.apply(candidate, instance, signal === undefined ? [] : [signal])
}
