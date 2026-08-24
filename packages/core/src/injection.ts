import type { TokenLike, TokenValue } from './token.js'

export interface InjectionContext {
  readonly consumer: TokenLike
  readonly resolve: <T>(token: TokenLike<T>) => T
  readonly record?: (consumer: TokenLike, dependency: TokenLike) => void
}

let currentInjectionContext: InjectionContext | undefined

/** @internal framework-managed class の同期 construction にだけ利用する。 */
export function runInInjectionContext<T>(
  context: InjectionContext,
  run: () => T,
): T {
  const previous = currentInjectionContext
  currentInjectionContext = context
  try {
    return run()
  } finally {
    currentInjectionContext = previous
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
  const context = currentInjectionContext
  if (!context) throw new InjectionContextError(token)
  context.record?.(context.consumer, token)
  return context.resolve(token) as TokenValue<TToken>
}
