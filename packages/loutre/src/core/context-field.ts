export interface ContextField<
  TName extends string = string,
  TShape extends object = object,
> {
  readonly kind: 'context-field'
  readonly name: TName
  readonly id: symbol
  readonly '~shape'?: TShape
}

export type ContextFieldValue<TField> =
  TField extends ContextField<infer TName, infer TShape>
    ? TName extends keyof TShape
      ? TShape[TName]
      : never
    : never

export type ContextShape<TField> =
  TField extends ContextField<infer TName, infer TShape>
    ? Pick<TShape, Extract<TName, keyof TShape>>
    : {}

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

export type ContextProperties<TFields extends readonly ContextField[]> = [
  TFields[number],
] extends [never]
  ? {}
  : UnionToIntersection<ContextShape<TFields[number]>>

type ContextFieldNameConstraint<TName extends string> = TName extends
  | ''
  | '__proto__'
  ? never
  : unknown

export function contextField<
  TShape extends object,
  const TName extends Extract<keyof TShape, string> = Extract<
    keyof TShape,
    string
  >,
>(
  name: TName & ContextFieldNameConstraint<TName>,
): ContextField<TName, TShape> {
  if (name.length === 0 || name === '__proto__') {
    throw new Error(`Invalid Context Field name: ${JSON.stringify(name)}`)
  }
  return Object.freeze({
    kind: 'context-field' as const,
    name,
    id: Symbol(name),
  })
}

export function contextFieldName(field: ContextField): string {
  return field.name
}
