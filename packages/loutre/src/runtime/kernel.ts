import {
  assertValidApplicationModel,
  loadArgs,
  loadEnv,
  RuntimeCapabilityRegistry,
  type ApplicationModel,
  type ExecutionExtension,
  type ExecutionExtensionRuntime,
  type ExecutionKernelRuntime,
  type ExecutionLease,
  type LifecycleHook,
  type ModuleInstance,
  type ProviderDescriptor,
  type RuntimeCapabilityBinding,
  type TokenLike,
} from '../core/index.js'
import { Container } from './di.js'
import { Logger } from './logger.js'

export interface ApplicationKernelRuntimeOptions {
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
  readonly logger?: Logger
  readonly environmentSource?: unknown
  readonly argumentsSource?: unknown
}

type RuntimeState =
  | 'created'
  | 'initializing'
  | 'running'
  | 'draining'
  | 'stopped'

interface ActiveExecution extends ExecutionLease {
  readonly controller: AbortController
  completed: boolean
}

export class ApplicationKernelRuntime implements ExecutionKernelRuntime {
  readonly model: ApplicationModel
  readonly container: Container
  readonly capabilities: RuntimeCapabilityRegistry
  readonly #extensionRuntimes = new Map<
    ExecutionExtension,
    ExecutionExtensionRuntime
  >()
  readonly #providerInstances = new Map<ModuleInstance, unknown[]>()
  readonly #activeExecutions = new Set<ActiveExecution>()
  readonly #idleWaiters = new Set<() => void>()
  readonly #environmentSource: unknown
  readonly #argumentsSource: unknown
  #state: RuntimeState = 'created'
  #initialization: Promise<void> | undefined
  #shutdown: Promise<void> | undefined

  constructor(
    model: ApplicationModel,
    options: ApplicationKernelRuntimeOptions = {},
  ) {
    this.model = assertValidApplicationModel(model)
    this.capabilities = new RuntimeCapabilityRegistry(
      options.capabilities ?? [],
    )
    this.#environmentSource = options.environmentSource
    this.#argumentsSource = options.argumentsSource ?? Object.freeze({})
    this.container = new Container(model.providers, {
      logger: options.logger ?? new Logger(),
    })
  }

  initialize(): Promise<void> {
    if (this.#state === 'running') return Promise.resolve()
    if (this.#initialization) return this.#initialization
    if (this.#state === 'draining' || this.#state === 'stopped') {
      return Promise.reject(applicationStateError(this.#state))
    }
    const initialization = this.#initialize().finally(() => {
      if (this.#initialization === initialization) {
        this.#initialization = undefined
      }
    })
    this.#initialization = initialization
    return initialization
  }

  async #initialize(): Promise<void> {
    this.#state = 'initializing'
    try {
      this.#validateCapabilities()
      await this.#bindRuntimeInputs()
      await this.#initializeProviders()
      for (const modelExtension of this.model.extensions) {
        const runtime = await modelExtension.extension.createRuntime({
          executions: modelExtension.executions as never,
          capabilities: this.capabilities,
          applicationRuntime: this,
        })
        this.#extensionRuntimes.set(modelExtension.extension, runtime)
      }
      this.#state = 'running'
    } catch (error) {
      const cleanupErrors = await this.#rollbackInitialization()
      this.#state = 'stopped'
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          'Application initialization failed and cleanup also failed.',
          { cause: error },
        )
      }
      throw error
    }
  }

  #validateCapabilities(): void {
    const missing = new Map<string, string[]>()
    for (const execution of this.model.executions) {
      for (const capability of execution.capabilities) {
        if (this.capabilities.has(capability)) continue
        const consumers = missing.get(capability.id) ?? []
        consumers.push(execution.id)
        missing.set(capability.id, consumers)
      }
    }
    if (missing.size === 0) return
    const details = [...missing]
      .map(([id, consumers]) => `${id} (${consumers.join(', ')})`)
      .join(', ')
    throw new Error(`LUTRE_CAPABILITY_MISSING: ${details}`)
  }

  async #bindRuntimeInputs(): Promise<void> {
    for (const provider of this.model.providers) {
      if (provider.kind !== 'environment') continue
      if (this.#environmentSource === undefined) {
        throw new Error(
          `LUTRE_ENV_SOURCE_MISSING: ${provider.provide.name} requires an Environment source.`,
        )
      }
      this.container.bindEnvironment(
        provider.provide,
        await loadEnv(provider.provide, this.#environmentSource),
      )
    }
    if (this.model.arguments) {
      this.container.bindArguments(
        this.model.arguments,
        await loadArgs(this.model.arguments, this.#argumentsSource),
      )
    }
  }

  async #initializeProviders(): Promise<void> {
    for (const module of this.model.modules) {
      const instances: unknown[] = []
      this.#providerInstances.set(module, instances)
      for (const provider of providersOfModule(module, this.model.providers)) {
        if (
          provider.scope !== 'application' ||
          provider.kind === 'environment' ||
          provider.kind === 'arguments'
        ) {
          continue
        }
        const instance = this.container.resolve(provider.provide)
        instances.push(instance)
        await callLifecycle(instance, 'onModuleInit')
      }
      await this.#runHook(module.definition.lifecycle?.onModuleInit)
    }
    for (const module of this.model.modules) {
      for (const instance of this.#providerInstances.get(module) ?? []) {
        await callLifecycle(instance, 'onApplicationBootstrap')
      }
      await this.#runHook(module.definition.lifecycle?.onApplicationBootstrap)
    }
  }

  resolve<TValue>(token: TokenLike<TValue>): TValue {
    if (this.#state === 'created' || this.#state === 'stopped') {
      throw applicationStateError(this.#state)
    }
    return this.container.resolve(token)
  }

  get<TValue>(token: TokenLike<TValue>): TValue {
    if (this.#state !== 'running') throw applicationStateError(this.#state)
    return this.container.get(token)
  }

  extensionRuntime<TRuntime extends ExecutionExtensionRuntime>(
    extension: ExecutionExtension<any, any, any, any, TRuntime>,
  ): TRuntime {
    const runtime = this.#extensionRuntimes.get(extension)
    if (!runtime) {
      throw new Error(
        `LUTRE_EXTENSION_RUNTIME_MISSING: ${extension.name} is not initialized.`,
      )
    }
    return runtime as TRuntime
  }

  beginExecution(): ExecutionLease {
    if (this.#state !== 'running') throw applicationStateError(this.#state)
    const controller = new AbortController()
    const lease: ActiveExecution = {
      controller,
      signal: controller.signal,
      completed: false,
      abort: (reason?: unknown) => controller.abort(reason),
      complete: () => {
        if (lease.completed) return
        lease.completed = true
        if (!controller.signal.aborted) controller.abort()
        this.#activeExecutions.delete(lease)
        if (this.#activeExecutions.size === 0) {
          for (const resolve of this.#idleWaiters) resolve()
          this.#idleWaiters.clear()
        }
      },
    }
    this.#activeExecutions.add(lease)
    return lease
  }

  shutdown(signal?: string): Promise<void> {
    if (this.#state === 'stopped') return Promise.resolve()
    if (this.#shutdown) return this.#shutdown
    const shutdown = this.#shutdownApplication(signal)
    this.#shutdown = shutdown
    return shutdown
  }

  async #shutdownApplication(signal?: string): Promise<void> {
    if (this.#initialization) await this.#initialization.catch(() => undefined)
    if (this.#state === 'created') {
      this.#state = 'stopped'
      return
    }
    if (this.#state === 'stopped') return
    this.#state = 'draining'
    const errors: unknown[] = []
    for (const { extension } of this.model.extensions) {
      const runtime = this.#extensionRuntimes.get(extension)
      if (runtime?.drain) await collectError(() => runtime.drain!(), errors)
    }
    if (this.#activeExecutions.size > 0) {
      await new Promise<void>((resolve) => this.#idleWaiters.add(resolve))
    }
    for (const { extension } of this.model.extensions.toReversed()) {
      const runtime = this.#extensionRuntimes.get(extension)
      if (runtime?.close) await collectError(() => runtime.close!(), errors)
    }
    await this.#cleanupProviders(signal, errors)
    this.#state = 'stopped'
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Application shutdown failed.')
    }
  }

  async #cleanupProviders(signal: string | undefined, errors: unknown[]) {
    for (const module of this.model.modules.toReversed()) {
      for (const instance of (
        this.#providerInstances.get(module) ?? []
      ).toReversed()) {
        await collectError(
          () => callLifecycle(instance, 'beforeApplicationShutdown', signal),
          errors,
        )
      }
      await collectError(
        () =>
          this.#runHook(module.definition.lifecycle?.beforeApplicationShutdown),
        errors,
      )
    }
    for (const module of this.model.modules.toReversed()) {
      for (const instance of (
        this.#providerInstances.get(module) ?? []
      ).toReversed()) {
        await collectError(
          () => callLifecycle(instance, 'onModuleDestroy'),
          errors,
        )
      }
      await collectError(
        () => this.#runHook(module.definition.lifecycle?.onModuleDestroy),
        errors,
      )
    }
    for (const module of this.model.modules.toReversed()) {
      for (const instance of (
        this.#providerInstances.get(module) ?? []
      ).toReversed()) {
        await collectError(
          () => callLifecycle(instance, 'onApplicationShutdown', signal),
          errors,
        )
      }
      await collectError(
        () => this.#runHook(module.definition.lifecycle?.onApplicationShutdown),
        errors,
      )
    }
  }

  async #rollbackInitialization(): Promise<unknown[]> {
    const errors: unknown[] = []
    for (const runtime of [...this.#extensionRuntimes.values()].toReversed()) {
      if (runtime.close) await collectError(() => runtime.close!(), errors)
    }
    await this.#cleanupProviders(undefined, errors)
    return errors
  }

  async #runHook(hook: LifecycleHook<any> | undefined): Promise<void> {
    if (!hook) return
    const dependencies = hook.inject.map((token: TokenLike) =>
      this.container.resolve(token),
    )
    await hook.run(...dependencies)
  }
}

function providersOfModule(
  module: ModuleInstance,
  providers: readonly ProviderDescriptor[],
): readonly ProviderDescriptor[] {
  const declared = new Set(
    (module.definition.providers ?? []).map((provider) =>
      typeof provider === 'function' ? provider : provider.provide,
    ),
  )
  return providers.filter((provider) => declared.has(provider.provide))
}

async function collectError(
  operation: () => void | Promise<void>,
  errors: unknown[],
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    errors.push(error)
  }
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
  ) {
    return
  }
  const candidate = (instance as Record<string, unknown>)[method]
  if (typeof candidate !== 'function') return
  await Reflect.apply(candidate, instance, signal === undefined ? [] : [signal])
}

function applicationStateError(state: RuntimeState): Error {
  return new Error(
    `LUTRE_APPLICATION_STATE: Application is ${state} and cannot perform this operation.`,
  )
}
