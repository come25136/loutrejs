export const httpNodeMetadata: unique symbol = Symbol(
  'loutre.http-node-metadata',
)

export interface HttpNodeRuntimeMetadata {
  readonly kind: 'leaf' | 'branch'
  readonly root: object
  readonly path: readonly string[]
  readonly source: object
  readonly handlerName?: string
}
