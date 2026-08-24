import {
  asModuleInstance,
  getExplicitInjections,
  normalizeProvider,
  tokenName,
  type Class,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrefw/core'
import { ConsoleLoggerBackend, Logger } from './logger.js'

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
  readonly #implementationCache = new Map<Class, Promise<unknown>>()

  readonly #constructorDependencies: ReadonlyMap<Function, readonly TokenLike[]>

  constructor(
    providers: readonly ProviderDescriptor[],
    options: {
      readonly constructorDependencies?: ReadonlyMap<
        Function,
        readonly TokenLike[]
      >
    } = {},
  ) {
    this.#constructorDependencies = options.constructorDependencies ?? new Map()
    for (const provider of providers) {
      if (this.#providers.has(provider.provide)) {
        throw new DependencyResolutionError(
          `Duplicate provider for ${tokenName(provider.provide)}`,
        )
      }
      this.#providers.set(provider.provide, provider)
    }
  }

  async resolve<T>(token: TokenLike<T>): Promise<T> {
    return this.#resolve(token)
  }

  async resolveImplementation<T>(target: Class<T>): Promise<T> {
    const cached = this.#implementationCache.get(target)
    if (cached) return cached as Promise<T>

    const pending = this.#instantiate(target)
    this.#implementationCache.set(target, pending)
    try {
      return await pending
    } catch (error) {
      if (this.#implementationCache.get(target) === pending) {
        this.#implementationCache.delete(target)
      }
      throw error
    }
  }

  async #resolve<T>(
    token: TokenLike<T>,
    source?: string,
  ): Promise<T> {
    const provider = this.#providers.get(token)
    if (!provider) {
      if (
        (token as TokenLike) === (Logger as unknown as TokenLike)
      ) {
        return new Logger(new ConsoleLoggerBackend(), {
          ...(source === undefined ? {} : { source }),
        }) as T
      }
      if (typeof token === 'function') {
        return this.#instantiate(token as Class<T>)
      }
      throw new DependencyResolutionError(`No provider for ${tokenName(token)}`)
    }

    if (provider.scope === 'application' && this.#applicationCache.has(token)) {
      return this.#applicationCache.get(token) as T
    }
    const value = await this.#create(provider)
    if (provider.scope === 'application') this.#applicationCache.set(token, value)
    return value as T
  }

  async #create(
    provider: ProviderDescriptor,
  ): Promise<unknown> {
    switch (provider.kind) {
      case 'value':
        return provider.useValue
      case 'class':
        return this.#instantiate(provider.useClass)
      case 'factory': {
        const dependencies = await Promise.all(
          provider.inject.map((token) => this.#resolve(token)),
        )
        return provider.useFactory(...dependencies)
      }
      case 'conditional': {
        const env = await this.#resolve(provider.select.env) as Record<
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
        return this.#instantiate(implementation)
      }
    }
  }

  async #instantiate<T>(
    target: Class<T>,
  ): Promise<T> {
    const explicit = getExplicitInjections(target)
    const manifested = this.#constructorDependencies.get(target)
    const parameterCount = target.length
    const missing = Array.from({ length: parameterCount }, (_, index) => index).filter(
      (index) => !explicit.has(index) && manifested?.[index] === undefined,
    )

    if (missing.length > 0) {
      throw new DependencyResolutionError(
        `${target.name} constructor parameters ${missing.join(', ')} are absent from the compiler manifest; custom tokens require @Inject(TOKEN)`,
      )
    }

    const dependencies = await Promise.all(
      Array.from({ length: parameterCount }, (_, index) => {
        const token = explicit.get(index) ?? manifested?.[index]
        if (!token) {
          throw new DependencyResolutionError(
            `No constructor token for ${target.name} parameter ${index}`,
          )
        }
        return this.#resolve(token, target.name)
      }),
    )
    return new target(...dependencies)
  }
}
