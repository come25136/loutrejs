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

export function tokenName(value: TokenLike): string {
  return typeof value === 'function' ? value.name : value.id
}
