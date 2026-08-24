export interface TokenOptions {
  readonly description?: string
}

export interface Token<T> {
  readonly kind: 'token'
  readonly id: string
  readonly description?: string
  readonly key: symbol
  readonly '~type'?: T
}

export type Class<T = unknown> = new (...args: any[]) => T
export type AbstractClass<T = unknown> = abstract new (...args: any[]) => T
export type TokenLike<T = unknown> = Token<T> | AbstractClass<T>
export type TokenValue<TToken> =
  TToken extends Token<infer Value>
    ? Value
    : TToken extends AbstractClass<infer Value>
      ? Value
      : never

export function token<T>(id: string, options: TokenOptions = {}): Token<T> {
  return Object.freeze({
    kind: 'token' as const,
    id,
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    key: Symbol(id),
  })
}

const injectionMetadata = new WeakMap<Function, Map<number, TokenLike>>()

/**
 * ランタイムには、明示されたcustom tokenの注釈だけを保持する。
 * すべてのconstructor依存辺のsource of truthはCompiler IRであり、この限定的な
 * registryは、manifest出力を実装する前の最初のvertical sliceを実行するために使う。
 */
export function Inject<T>(dependency: TokenLike<T>): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const constructor = target as Function
    const dependencies = injectionMetadata.get(constructor) ?? new Map()
    dependencies.set(parameterIndex, dependency)
    injectionMetadata.set(constructor, dependencies)
  }
}

export function getExplicitInjections(
  target: Function,
): ReadonlyMap<number, TokenLike> {
  return injectionMetadata.get(target) ?? new Map()
}

export function tokenName(value: TokenLike): string {
  return typeof value === 'function' ? value.name : value.id
}
