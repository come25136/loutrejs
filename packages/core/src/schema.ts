import type { StandardSchemaV1 } from '@standard-schema/spec'

export type { StandardSchemaV1 } from '@standard-schema/spec'

export type StandardSchemaResult<Output> = StandardSchemaV1.Result<Output>

export type SchemaOutput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never

export type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never

export async function validateSchema<Schema extends StandardSchemaV1>(
  schema: Schema,
  value: unknown,
): Promise<SchemaOutput<Schema>> {
  const result = await schema['~standard'].validate(value)

  if (result.issues) {
    throw new SchemaValidationError(result.issues)
  }

  return result.value as SchemaOutput<Schema>
}

export class SchemaValidationError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: SchemaValidationError['issues']) {
    super('Schema validation failed')
    this.name = 'SchemaValidationError'
    this.issues = issues
  }
}
