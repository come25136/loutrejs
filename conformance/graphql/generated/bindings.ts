// @generated loutre graphql generateの出力です。直接編集しないでください。
import type { DocumentNode } from 'graphql'
import {
  bindManifest as bindRuntimeManifest,
  type GraphQLManifest,
} from '@loutrejs/graphql/runtime'
import type { Resolvers } from './types.js'
export function bindManifest<Context extends object>(input: {
  readonly schemaDocument: DocumentNode
  readonly resolvers: Resolvers<Context>
}): GraphQLManifest<Context> {
  return bindRuntimeManifest<Context>(input)
}
