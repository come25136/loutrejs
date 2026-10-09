// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: ad91d979bbcf1c7f62680b788972dab150fca86baf5344016ae7928239a7d19d
import { bindManifest } from '@loutrejs/graphql/runtime'
import { schemaDocument } from './schema-ast.js'
import { resolvers } from '../graphql/resolvers.js'
import type { SchemaFields } from './types.js'
export type * from './types.js'
export const manifest = bindManifest<
  SchemaFields['Query']['orders']['context']
>({
  schemaDocument,
  resolvers,
  fingerprint:
    'ad91d979bbcf1c7f62680b788972dab150fca86baf5344016ae7928239a7d19d',
})
