import type { SchemaOutput, StandardSchemaV1 } from './schema.js'

const domainErrorMarker = Symbol('loutre.domain-error')

export class DomainError<TData = unknown> extends Error {
  readonly [domainErrorMarker] = true

  constructor(
    readonly code: string,
    readonly data: TData,
    options: { readonly cause?: unknown } = {},
  ) {
    super(code, options)
    this.name = 'DomainError'
  }
}

export interface ErrorDefinition<
  TCode extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  (
    data: SchemaOutput<TSchema>,
    options?: { readonly cause?: unknown },
  ): DomainError<SchemaOutput<TSchema>>
  readonly kind: 'error-definition'
  readonly code: TCode
  readonly data: TSchema
  is(error: unknown): error is DomainError<SchemaOutput<TSchema>>
}

export function defineError<
  const TCode extends string,
  TSchema extends StandardSchemaV1,
>(definition: {
  readonly code: TCode
  readonly data: TSchema
}): ErrorDefinition<TCode, TSchema> {
  const factory = ((
    data: SchemaOutput<TSchema>,
    options: { readonly cause?: unknown } = {},
  ) => new DomainError(definition.code, data, options)) as ErrorDefinition<
    TCode,
    TSchema
  >
  Object.defineProperties(factory, {
    kind: { value: 'error-definition', enumerable: true },
    code: { value: definition.code, enumerable: true },
    data: { value: definition.data, enumerable: true },
    is: {
      value: (error: unknown) =>
        error instanceof DomainError && error.code === definition.code,
      enumerable: false,
    },
  })
  return factory
}
