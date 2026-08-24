import {
  asModuleInstance,
  normalizeProvider,
  tokenName,
  type Class,
  type ModuleInstance,
  type ModuleTemplate,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrejs/core'
import { Logger } from './logger.js'
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
  readonly #applicationCache = new Map<TokenLike, Promise<unknown>>()
  readonly #implementationCache = new Map<Class, Promise<unknown>>()

  readonly #linkedDependencies = new Map<Function, readonly TokenLike[]>()
  readonly #logger: Logger
  #linkageAttached = false
  #resolutionStarted = false

  constructor(
    providers: readonly ProviderDescriptor[],
    logger: Logger = new Logger(),
  ) {
    this.#logger = logger
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

    const pending = this.#instantiate(target, [target])
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
    lineage: readonly TokenLike[] = [],
  ): Promise<T> {
    this.#resolutionStarted = true
    const cycleStart = lineage.indexOf(token)
    if (cycleStart >= 0) {
      const cycle = [...lineage.slice(cycleStart), token]
        .map(tokenName)
        .join(' -> ')
      throw new DependencyResolutionError(`循環依存を検出しました: ${cycle}`)
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
      if (typeof token === 'function') {
        return this.#instantiate(token as Class<T>, [...lineage, token])
      }
      throw new DependencyResolutionError(`No provider for ${tokenName(token)}`)
    }

    const nextLineage = [...lineage, token]
    if (provider.scope !== 'application') {
      return await this.#create(provider, nextLineage) as T
    }

    const cached = this.#applicationCache.get(token)
    if (cached) return await cached as T

    const pending = this.#create(provider, nextLineage)
    this.#applicationCache.set(token, pending)
    try {
      return await pending as T
    } catch (error) {
      if (this.#applicationCache.get(token) === pending) {
        this.#applicationCache.delete(token)
      }
      throw error
    }
  }

  async #create(
    provider: ProviderDescriptor,
    lineage: readonly TokenLike[],
  ): Promise<unknown> {
    switch (provider.kind) {
      case 'value':
        return provider.useValue
      case 'class':
        return this.#instantiate(provider.useClass, lineage)
      case 'factory': {
        const dependencies = await Promise.all(
          provider.inject.map((token) => this.#resolve(token, undefined, lineage)),
        )
        return provider.useFactory(...dependencies)
      }
      case 'conditional': {
        const env = await this.#resolve(
          provider.select.env,
          undefined,
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
  }

  async #instantiate<T>(
    target: Class<T>,
    lineage: readonly TokenLike[],
  ): Promise<T> {
    const manifested = this.#linkedDependencies.get(target)
    if (!manifested && target.length > 0) {
      throw new DependencyResolutionError(
        `${target.name}のconstructor DI linkageがありません。loutre dev/start/buildでCompilerを通して起動してください`,
      )
    }
    const dependencies = await Promise.all(
      (manifested ?? []).map((token) =>
        this.#resolve(token, target.name, lineage),
      ),
    )
    return new target(...dependencies)
  }
}
