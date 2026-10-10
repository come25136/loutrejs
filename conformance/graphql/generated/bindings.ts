// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 5dc16b678e7d8852024f3b58fe70385f66aff97681cdce56e7c4b1d8ec0f30d3
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
