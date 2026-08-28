import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'

export type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'

export type StandardSchemaResult<Output> = StandardSchemaV1.Result<Output>

export type SchemaOutput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : never

export type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never

export type JsonSchemaInput<Schema> = Schema extends StandardJSONSchemaV1
  ? StandardJSONSchemaV1.InferInput<Schema>
  : never

export type JsonSchemaOutput<Schema> = Schema extends StandardJSONSchemaV1
  ? StandardJSONSchemaV1.InferOutput<Schema>
  : never

export function supportsJsonSchema(
  schema: StandardSchemaV1,
): schema is StandardSchemaV1 & StandardJSONSchemaV1 {
  const standard = schema['~standard'] as StandardSchemaV1.Props &
    Partial<StandardJSONSchemaV1.Props>
  return (
    typeof standard.jsonSchema?.input === 'function' &&
    typeof standard.jsonSchema.output === 'function'
  )
}

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
