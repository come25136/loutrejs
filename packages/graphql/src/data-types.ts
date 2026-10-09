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
export interface SourceInput<P, A, C> extends ReadInput<P, A, C> {
  readonly signal: AbortSignal
  readonly demand: FieldSelection
}
export interface FieldOptions<P, A, R, C> {
  readonly requires?: readonly Extract<keyof P, string>[]
  readonly authorize?: (input: ReadInput<P, A, C>) => void | Promise<void>
  readonly read?: (input: ReadInput<P, A, C>) => ReadResult<R>
  readonly load: (
    parents: readonly P[],
    input: LoadInput<A, C>,
  ) => readonly R[] | Promise<readonly R[]>
  readonly maxBatchSize?: number
}
export interface FieldBuilder<P, A, R, C> {
  field(options: FieldOptions<P, A, R, C>): Resolver<P, A, R, C>
  source(
    resolve: (input: SourceInput<P, A, C>) => R | Promise<R>,
  ): Resolver<P, A, R, C>
}
export type SchemaData<Fields> = {
  readonly [T in keyof Fields]: {
    readonly [F in keyof Fields[T]]: Fields[T][F] extends FieldSpec<
      infer P,
      infer A,
      infer R,
      infer C
    >
      ? FieldBuilder<P, A, R, C>
      : never
  }
}
