import type { TokenLike } from './token.js'

export type RuntimeInputContract = TokenLike<object> & {
  readonly name: string
}

export interface RuntimeInputKey<TValue = unknown> {
  readonly kind: 'runtime-input-key'
  readonly source: 'environment' | 'arguments'
  readonly contract: RuntimeInputContract
  /** Graph v3互換compiler専用の別名であり、新しい処理では`contract`を使う。 */
  readonly env: RuntimeInputContract
  readonly key: string
  readonly '~value'?: TValue
}
