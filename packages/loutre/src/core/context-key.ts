export interface ContextKey<
  TName extends string = string,
  TShape extends object = object,
> {
  readonly kind: 'context-key'
  readonly name: TName
  readonly key: symbol
  readonly '~shape'?: TShape
}

export type ContextKeyValue<TKey> =
  TKey extends ContextKey<infer TName, infer TShape>
    ? TName extends keyof TShape
      ? TShape[TName]
      : never
    : never

export type ContextShape<TKey> =
  TKey extends ContextKey<infer TName, infer TShape>
    ? Pick<TShape, Extract<TName, keyof TShape>>
    : {}

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

export type ContextProperties<TKeys extends readonly ContextKey[]> = [
  TKeys[number],
] extends [never]
  ? {}
  : UnionToIntersection<ContextShape<TKeys[number]>>

type ContextKeyNameConstraint<TName extends string> = TName extends
  | ''
  | '__proto__'
  ? never
  : unknown

export function contextKey<
  TShape extends object,
  const TName extends Extract<keyof TShape, string> = Extract<
    keyof TShape,
    string
  >,
>(name: TName & ContextKeyNameConstraint<TName>): ContextKey<TName, TShape> {
  if (name.length === 0 || name === '__proto__') {
    throw new Error(`Invalid Context Key name: ${JSON.stringify(name)}`)
  }
  return Object.freeze({
    kind: 'context-key' as const,
    name,
    key: Symbol(name),
  })
}

export function contextKeyName(key: ContextKey): string {
  return key.name
}
