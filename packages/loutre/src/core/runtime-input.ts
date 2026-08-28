import type { TokenLike } from './token.js'

export type RuntimeInputContract = TokenLike<object> & {
  readonly name: string
}

export interface RuntimeInputKey<TValue = unknown> {
  readonly kind: 'runtime-input-key'
  readonly source: 'environment' | 'arguments'
  readonly contract: RuntimeInputContract
  readonly key: string
  readonly '~value'?: TValue
}
