import {
  isArgsClass,
  isEnvClass,
  runInInjectionContext,
  tokenName,
  type ArgsClass,
  type Class,
  type EnvClass,
  type ProviderDescriptor,
  type TokenLike,
} from '../core/index.js'
import { Logger } from './logger.js'

export class DependencyResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyResolutionError'
  }
}

export interface ContainerOptions {
  readonly logger?: Logger
  readonly environment?: ReadonlyMap<EnvClass, object>
  readonly arguments?: ReadonlyMap<ArgsClass, object>
}

export class Container {
  readonly #providers = new Map<TokenLike, ProviderDescriptor>()
  readonly #applicationCache = new Map<TokenLike, unknown>()
  readonly #logger: Logger
  readonly #environment = new Map<EnvClass, object>()
  readonly #arguments = new Map<ArgsClass, object>()

  constructor(
    providers: readonly ProviderDescriptor[],
    options: Logger | ContainerOptions = {},
  ) {
    this.#logger =
      options instanceof Logger ? options : (options.logger ?? new Logger())
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

  resolve<T>(token: TokenLike<T>, source?: string): T {
    return this.#resolve(token, source)
  }

  get<T>(token: TokenLike<T>): T {
    const provider = this.#providers.get(token)
    if (!provider) {
      if (isEnvClass(token)) {
        throw new DependencyResolutionError(
          `LUTRE_ENV_002: ${token.name} is not declared by any Module.environment.`,
        )
      }
      if (isArgsClass(token)) {
        throw new DependencyResolutionError(
          `LUTRE_ARGS_002: ${token.name} is not declared by Application.arguments.`,
        )
      }
      throw new DependencyResolutionError(
        `LUTRE_DI_UNRESOLVED: Application requires ${tokenName(token)}, but no provider is declared for ${tokenName(token)}.`,
      )
    }
    if (provider.scope !== 'application') {
      throw new DependencyResolutionError(
        `LUTRE_DI_SCOPED_GET: ${tokenName(token)} is ${provider.scope}-scoped and cannot be retrieved with Application.get().`,
      )
    }
    if (provider.kind === 'environment') {
      if (this.#environment.has(provider.provide)) {
        return this.#environment.get(provider.provide) as T
      }
      throw new DependencyResolutionError(
        `LUTRE_ENV_005: Environment ${provider.provide.name} requires a runtime Environment source before Application initialization.`,
      )
    }
    if (provider.kind === 'arguments') {
      if (this.#arguments.has(provider.provide)) {
        return this.#arguments.get(provider.provide) as T
      }
      throw new DependencyResolutionError(
        `LUTRE_ARGS_005: Arguments ${provider.provide.name} requires runtime Arguments before Application initialization.`,
      )
    }
    if (this.#applicationCache.has(token)) {
      return this.#applicationCache.get(token) as T
    }
    throw new DependencyResolutionError(
      `LUTRE_DI_NOT_INITIALIZED: ${tokenName(token)} has not been constructed by Application initialization.`,
    )
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
        `LUTRE_DI_CYCLE: Circular dependency detected: ${cycle}`,
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
    if (this.#applicationCache.has(token)) {
      return this.#applicationCache.get(token) as T
    }
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
          throw new DependencyResolutionError(
            `LUTRE_ENV_005: Environment ${provider.provide.name} requires a runtime Environment source before Application initialization.`,
          )
        }
        case 'arguments': {
          if (this.#arguments.has(provider.provide)) {
            return this.#arguments.get(provider.provide)
          }
          throw new DependencyResolutionError(
            `LUTRE_ARGS_005: Arguments ${provider.provide.name} requires runtime Arguments before Application initialization.`,
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
          const input = this.#resolve(
            provider.select.contract,
            tokenName(provider.provide),
            lineage,
          ) as Record<string, unknown>
          const selected = input[provider.select.key]
          const implementation = provider.mapping[selected as PropertyKey]
          if (!implementation) {
            throw new DependencyResolutionError(
              `No conditional Provider matches ${provider.select.key}=${String(selected)}`,
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
      },
      () => new target(),
    )
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) ||
      typeof value === 'function') &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
