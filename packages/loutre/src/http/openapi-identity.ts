import type { Brand } from '../internal/brand.js'
export type OpenApiOperationId = Brand<string, 'openapi.operation-id'>
export type OpenApiSchemaName = Brand<string, 'openapi.schema-name'>
export type JsonSchemaReference = Brand<string, 'openapi.schema-reference'>
export type SchemaComparisonKey = Brand<string, 'openapi.schema-comparison-key'>
export const openApiOperationId = (value: string): OpenApiOperationId =>
  value as OpenApiOperationId
export const openApiSchemaName = (value: string): OpenApiSchemaName =>
  value as OpenApiSchemaName
export const jsonSchemaReference = (value: string): JsonSchemaReference =>
  value as JsonSchemaReference
export const schemaComparisonKey = (value: unknown): SchemaComparisonKey =>
  JSON.stringify(value) as SchemaComparisonKey
