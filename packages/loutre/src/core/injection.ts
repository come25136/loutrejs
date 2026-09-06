import type { TokenLike, TokenValue } from './token.js'

export interface DependencyConsumerDescriptor {
  readonly id: string
  readonly name: string
  readonly kind?: string
}

export type DependencyConsumer = TokenLike | DependencyConsumerDescriptor

export interface InjectionContext {
  readonly consumer: DependencyConsumer
  readonly resolve: <T>(token: TokenLike<T>) => T
  readonly record?: (
    consumer: DependencyConsumer,
    dependency: TokenLike,
  ) => void
}

const injectionContextKey = Symbol.for('loutre.injection-context')

function currentInjectionContext(): InjectionContext | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[injectionContextKey] as
    | InjectionContext
    | undefined
}

function setCurrentInjectionContext(
  context: InjectionContext | undefined,
): void {
  const storage = globalThis as Record<PropertyKey, unknown>
  if (context === undefined) delete storage[injectionContextKey]
  else storage[injectionContextKey] = context
}

export function runInInjectionContext<T>(
  context: InjectionContext,
  run: () => T,
): T {
  const previous = currentInjectionContext()
  setCurrentInjectionContext(context)
  try {
    return run()
  } finally {
    setCurrentInjectionContext(previous)
  }
}

export class InjectionContextError extends Error {
  readonly code = 'LUTRE_DI_CONTEXT'

  constructor(token: TokenLike) {
    super(
      `inject(${typeof token === 'function' ? token.name : token.id}) was called outside a Loutre injection context.`,
    )
    this.name = 'InjectionContextError'
  }
}

export function inject<TToken extends TokenLike>(
  token: TToken,
): TokenValue<TToken> {
  const context = currentInjectionContext()
  if (!context) throw new InjectionContextError(token)
  context.record?.(context.consumer, token)
  return context.resolve(token) as TokenValue<TToken>
}

function dependencyProbeTarget() {}

class DependencyProbeBoundary extends Error {
  constructor(readonly source: string) {
    super(`Dependency probe reached runtime-dependent value: ${source}`)
    this.name = 'DependencyProbeBoundary'
  }
}

export function collectInjectedDependencies(
  consumer: DependencyConsumer,
  construct: () => unknown,
): readonly TokenLike[] {
  const dependencies = new Set<TokenLike>()
  try {
    runInInjectionContext(
      {
        consumer,
        resolve: (token) => createDependencyProbeValue(token) as never,
        record: (_consumer, dependency) => dependencies.add(dependency),
      },
      construct,
    )
  } catch (error) {
    if (!(error instanceof DependencyProbeBoundary)) throw error
  }
  return [...dependencies]
}

function createDependencyProbeValue(token: TokenLike): object {
  const source = typeof token === 'function' ? token.name : token.id
  const boundary = (operation: PropertyKey) =>
    new DependencyProbeBoundary(`${source}.${String(operation)}`)
  return new Proxy(dependencyProbeTarget, {
    apply() {
      throw boundary('[[Call]]')
    },
    construct() {
      throw boundary('[[Construct]]')
    },
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
