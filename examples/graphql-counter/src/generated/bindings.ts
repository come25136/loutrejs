// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 664162c93234a7bcc06c565920ca14d9fe9f4b7c3e89990bba965594316b6a3c
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
