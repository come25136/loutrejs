declare const contextFieldShape: unique symbol

export interface ContextField<TShape extends object = object> {
  readonly kind: 'context-field'
  readonly [contextFieldShape]: TShape
}

export type ContextFieldValue<TField> =
  TField extends ContextField<infer TShape>
    ? TShape[Extract<keyof TShape, string>]
    : never

export type ContextShape<TField> =
  TField extends ContextField<infer TShape> ? TShape : {}

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

type SingleContextFieldName<
  TShape extends object,
  TName extends keyof TShape = keyof TShape,
> = TName extends keyof TShape
  ? Exclude<keyof TShape, TName> extends never
    ? TName extends string
      ? string extends TName
        ? never
        : TName extends '' | '__proto__'
          ? never
          : {} extends Pick<TShape, TName>
            ? never
            : TName
      : never
    : never
  : never

type IsContextFieldShape<TShape extends object> = [
  SingleContextFieldName<TShape>,
] extends [never]
  ? false
  : true

export function contextField<TShape extends object>(
  ...invalid: IsContextFieldShape<TShape> extends true ? [] : [never]
): ContextField<TShape> {
  void invalid
  return Object.freeze({
    kind: 'context-field' as const,
  }) as ContextField<TShape>
}
