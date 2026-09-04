declare const typeValue: unique symbol

const typeCarrier = Object.freeze({})

export interface Type<T> {
  readonly [typeValue]: T
}

export type TypeOf<TType> = TType extends Type<infer TValue> ? TValue : never

export function type<T>(): Type<T> {
  return typeCarrier as Type<T>
}
