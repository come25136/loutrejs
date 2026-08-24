import {
  asModuleInstance,
  normalizeProvider,
  tokenName,
  type Class,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrefw/core'
import { ConsoleLoggerBackend, Logger } from './logger.js'
import {
  runtimeLinkageTarget,
  type RuntimeLinkageArtifact,
} from './linkage.js'

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

  readonly #linkedDependencies = new Map<Function, readonly TokenLike[]>()
  #linkageAttached = false
  #resolutionStarted = false

  constructor(
    providers: readonly ProviderDescriptor[],
  ) {
    for (const provider of providers) {
      if (this.#providers.has(provider.provide)) {
        throw new DependencyResolutionError(
          `Duplicate provider for ${tokenName(provider.provide)}`,
        )
      }
      this.#providers.set(provider.provide, provider)
    }
  }

  /** @internal Compilerが生成したbootstrapだけが呼び出す。 */
  [runtimeLinkageTarget](artifact: RuntimeLinkageArtifact): void {
    if (this.#linkageAttached) {
      throw new DependencyResolutionError(
        'Runtime Linkage ArtifactはApplicationへ1回だけ関連付けできます',
      )
    }
    if (this.#resolutionStarted) {
      throw new DependencyResolutionError(
        'Provider解決開始後にRuntime Linkage Artifactを関連付けることはできません',
      )
    }
    for (const [target, dependencies] of artifact.bindings) {
      if (this.#linkedDependencies.has(target)) {
        throw new DependencyResolutionError(
          `${target.name}のconstructor linkageが重複しています`,
        )
      }
      this.#linkedDependencies.set(target, dependencies)
    }
    this.#linkageAttached = true
  }

  async resolve<T>(token: TokenLike<T>): Promise<T> {
    return this.#resolve(token)
  }

  async resolveImplementation<T>(target: Class<T>): Promise<T> {
    this.#resolutionStarted = true
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
    this.#resolutionStarted = true
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
    const manifested = this.#linkedDependencies.get(target)
    if (!manifested && target.length > 0) {
      throw new DependencyResolutionError(
        `${target.name}のconstructor DI linkageがありません。loutre dev/start/buildでCompilerを通して起動してください`,
      )
    }
    const dependencies = await Promise.all(
      (manifested ?? []).map((token) => this.#resolve(token, target.name)),
    )
    return new target(...dependencies)
  }
}
