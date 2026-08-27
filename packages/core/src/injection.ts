import type { TokenLike, TokenValue } from './token.js'

export interface LayerConsumer {
  readonly kind: 'layer-consumer'
  readonly id: string
  readonly name: string
}

export interface ImplementationConsumer {
  readonly kind: 'implementation-consumer'
  readonly id: string
  readonly name: string
}

export interface EntrypointConsumer {
  readonly kind: 'entrypoint-consumer'
  readonly id: string
  readonly name: string
}

export type DependencyConsumer =
  | TokenLike
  | LayerConsumer
  | ImplementationConsumer
  | EntrypointConsumer

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

/** @internal framework-managedな同期constructionに利用する。 */
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
