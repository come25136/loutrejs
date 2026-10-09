// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: cf90e99265a2c18b6472caacadf5ec71c01e740b310b7e3c69ec5128b423eb8b
import { bindManifest } from '@loutrejs/graphql/runtime'
import { schemaDocument } from './schema-ast.js'
import { resolvers } from '../resolvers.js'
import type { SchemaFields } from './types.js'
export type * from './types.js'
export const manifest = bindManifest<SchemaFields['Query']['hello']['context']>(
  {
    schemaDocument,
    resolvers,
    fingerprint:
      'cf90e99265a2c18b6472caacadf5ec71c01e740b310b7e3c69ec5128b423eb8b',
  },
)
