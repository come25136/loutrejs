// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 1d64979b639c80b938d5db39ecf8f238fd8bc42f5ada36e18769e36b99358026
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
