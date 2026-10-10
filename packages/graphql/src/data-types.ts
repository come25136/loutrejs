import type { GraphQLResolveInfo } from 'graphql'

export interface FieldSpec<Parent, Args, Result, Context> {
  readonly parent: Parent
  readonly args: Args
  readonly result: Result
  readonly context: Context
}

export interface FieldSelection {
  readonly parentType: string
  readonly fieldName: string
  readonly responseKeys: readonly string[]
  readonly args: Readonly<Record<string, unknown>>
  readonly requires: readonly string[]
  readonly prefetchable: boolean
  readonly children: readonly FieldSelection[]
}

export type ReadResult<T> =
  | { readonly kind: 'loaded'; readonly value: T }
  | { readonly kind: 'missing' }
export type Resolver<P, A, R, C> = (
  parent: P,
  args: A,
  context: C,
  info: GraphQLResolveInfo,
) => R | Promise<R>
export interface ReadInput<P, A, C> {
  readonly parent: P
  readonly args: A
  readonly context: C
  readonly info: GraphQLResolveInfo
}
export interface LoadInput<A, C> {
  readonly args: A
  readonly context: C
  readonly signal: AbortSignal
  readonly selection: FieldSelection
}
export interface FieldOptions<P, A, R, C> {
  readonly resolve?: never
  readonly subscribe?: never
  readonly requires?: readonly Extract<keyof P, string>[]
  readonly authorize?: (input: ReadInput<P, A, C>) => void | Promise<void>
  readonly read?: (input: ReadInput<P, A, C>) => ReadResult<R>
  readonly load: (
    parents: readonly P[],
    input: LoadInput<A, C>,
  ) => readonly R[] | Promise<readonly R[]>
  readonly maxBatchSize?: number
}
type BatchOptions<Spec> =
  Spec extends FieldSpec<infer P, infer A, infer R, infer C>
    ? FieldOptions<P, A, R, C>
    : never
type StandardBinding<Binding> = Binding & {
  readonly load?: never
  readonly requires?: never
  readonly read?: never
  readonly authorize?: never
  readonly maxBatchSize?: never
}
export type ResolverMap<StandardResolvers, Fields> = {
  [T in keyof StandardResolvers]: T extends keyof Fields
    ? {
        [F in keyof NonNullable<StandardResolvers[T]>]:
          | StandardBinding<NonNullable<StandardResolvers[T]>[F]>
          | (F extends keyof Fields[T] ? BatchOptions<Fields[T][F]> : never)
      }
    : StandardResolvers[T]
}
