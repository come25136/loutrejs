import type { StandardSchemaV1 } from '@loutrejs/core'
import type { HttpRequestBodyDefinition } from './definitions.js'

export function httpRequestBodySchema(
  body: HttpRequestBodyDefinition,
): StandardSchemaV1 {
  return body.schema
}

export function httpRequestBodyContentType(
  body: HttpRequestBodyDefinition,
): string {
  return body.contentType
}
