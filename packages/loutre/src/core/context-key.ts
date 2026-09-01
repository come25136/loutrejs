export interface ContextKey<TName extends string = string, TValue = unknown> {
  readonly kind: 'context-key'
  readonly name: TName
  readonly key: symbol
  readonly '~value'?: TValue
}

export type ContextKeyValue<TKey> =
  TKey extends ContextKey<string, infer TValue> ? TValue : never

export type ContextProperties<TKeys extends readonly ContextKey[]> = {
  readonly [TKey in TKeys[number] as TKey['name']]: ContextKeyValue<TKey>
}

type ContextKeyNameConstraint<TName extends string> = TName extends
  | ''
  | '__proto__'
  ? never
  : unknown

export function contextKey<const TName extends string>(
  name: TName & ContextKeyNameConstraint<TName>,
) {
  if (name.length === 0 || name === '__proto__') {
    throw new Error(`Invalid Context Key name: ${JSON.stringify(name)}`)
  }
  return {
    of<TValue>(): ContextKey<TName, TValue> {
      return Object.freeze({
        kind: 'context-key' as const,
        name,
        key: Symbol(name),
      })
    },
  }
}

export function contextKeyName(key: ContextKey): string {
  return key.name
}
