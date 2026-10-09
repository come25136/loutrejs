// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: afedce8c88d098bf929f905c1cde61aa5d8a5575d70deba73c161afc82969154
import { bindManifest } from '@loutrejs/graphql/runtime'
import { schemaDocument } from './schema-ast.js'
import { resolvers } from '../graphql/resolvers.js'
import type { SchemaFields } from './types.js'
export type * from './types.js'
export const manifest = bindManifest<
  SchemaFields['Query']['counter']['context']
>({
  schemaDocument,
  resolvers,
  fingerprint:
    'afedce8c88d098bf929f905c1cde61aa5d8a5575d70deba73c161afc82969154',
})
