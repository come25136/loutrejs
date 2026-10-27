import type { Descriptor } from '../internal/brand.js'
import type { TokenKey } from './identity.js'
export interface TokenOptions {
  readonly description?: string
}

export interface Token<T> extends Descriptor<'token'> {
  readonly kind: 'token'
  readonly id: string
  readonly description?: string
  readonly key: TokenKey
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
    key: Symbol(id) as TokenKey,
  }) as Token<T>
}

export function tokenName(value: TokenLike): string {
  return typeof value === 'function' ? value.name : value.id
}
