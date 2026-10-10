import type { GraphQLSchema } from 'graphql'
import type { DataDefinition } from './data-internal.js'

declare const manifestBrand: unique symbol
export interface GraphQLManifest<Context extends object = object> {
  readonly [manifestBrand]: Context
}
export interface BoundManifest {
  readonly schema: GraphQLSchema
  readonly metadata: ReadonlyMap<string, DataDefinition>
}
const manifests = new WeakMap<object, BoundManifest>()
export function storeManifest<C extends object>(
  bound: BoundManifest,
): GraphQLManifest<C> {
  const manifest = Object.freeze({})
  manifests.set(manifest, bound)
  return manifest as GraphQLManifest<C>
}
export function getManifest(manifest: GraphQLManifest): BoundManifest {
  const bound = manifests.get(manifest)
  if (!bound)
    throw new TypeError(
      'bindManifest()が返したGraphQL Runtime Manifestを指定してください。',
    )
  return bound
}
