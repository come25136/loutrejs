import { SchemaValidationError, validateSchema } from '../core/index.js'
import type { HttpParamsSchemas } from './definitions.js'

export async function validateHttpParamsSchemas(
  schemas: HttpParamsSchemas,
  value: Readonly<Record<string, string>>,
): Promise<Record<string, unknown>> {
  const output: Record<string, unknown> = {}
  for (const [name, schema] of Object.entries(schemas)) {
    try {
      output[name] = await validateSchema(schema, value[name])
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        throw new SchemaValidationError(
          error.issues.map((issue) => ({
            ...issue,
            path: [name, ...(issue.path ?? [])],
          })),
        )
      }
      throw error
    }
  }
  return output
}
