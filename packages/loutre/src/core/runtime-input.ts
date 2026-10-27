import type { Descriptor } from '../internal/brand.js'
import type { TokenLike } from './token.js'

export type RuntimeInputContract = TokenLike<object> & {
  readonly name: string
}

export interface RuntimeInputKey<
  TValue = unknown,
> extends Descriptor<'runtime-input-key'> {
  readonly kind: 'runtime-input-key'
  readonly source: 'environment' | 'arguments'
  readonly contract: RuntimeInputContract
  readonly key: string
  readonly '~value'?: TValue
}
