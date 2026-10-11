import type { StandardSchemaV1 } from '../core/index.js'

export interface HttpRequestHeadDefinition {
  readonly params?: Readonly<Record<string, StandardSchemaV1>>
  readonly query?: StandardSchemaV1
  readonly headers?: StandardSchemaV1
}
