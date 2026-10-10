import type { GraphQLResolveInfo } from 'graphql'
import { registerData, inheritData, invokeData } from './data-internal.js'

export type * from './data-types.js'
import type {
  ReadResult,
  FieldOptions,
  SourceInput,
  SchemaData,
  Resolver,
  ReadInput,
} from './data-types.js'

export const missing = Object.freeze({ kind: 'missing' as const })
export function loaded<T>(
  value: T extends undefined ? never : T,
): ReadResult<T> {
  if (value === undefined)
    throw new TypeError('loaded(undefined)は使用できません。')
  return { kind: 'loaded', value } as ReadResult<T>
}

export function createSchemaData<Fields>(identities: {
  readonly [T in keyof Fields]: { readonly [F in keyof Fields[T]]: string }
}): SchemaData<Fields> {
  const registry = Object.fromEntries(
    Object.entries(identities as Record<string, Record<string, string>>).map(
      ([type, fields]) => [
        type,
        Object.freeze(
          Object.fromEntries(
            Object.entries(fields).map(([field, identity]) => [
              field,
              Object.freeze({
                field(
                  options: FieldOptions<unknown, unknown, unknown, unknown>,
                ) {
                  if (typeof options.load !== 'function')
                    throw new TypeError(`${identity}にloadが必要です。`)
                  if (
                    options.maxBatchSize !== undefined &&
                    (!Number.isSafeInteger(options.maxBatchSize) ||
                      options.maxBatchSize < 1)
                  )
                    throw new TypeError(
                      `${identity}.maxBatchSizeは正の整数にしてください。`,
                    )
                  const resolve = (
                    parent: unknown,
                    args: unknown,
                    context: unknown,
                    info: GraphQLResolveInfo,
                  ) =>
                    invokeData(resolve, parent, args, context, info, identity)
                  registerData(resolve, {
                    identity,
                    kind: 'field',
                    options: Object.freeze({
                      ...options,
                      requires: Object.freeze([...(options.requires ?? [])]),
                    }),
                  })
                  return resolve
                },
                source(
                  source: (
                    input: SourceInput<unknown, unknown, unknown>,
                  ) => unknown,
                ) {
                  const resolve = (
                    parent: unknown,
                    args: unknown,
                    context: unknown,
                    info: GraphQLResolveInfo,
                  ) =>
                    invokeData(resolve, parent, args, context, info, identity)
                  registerData(resolve, {
                    identity,
                    kind: 'source',
                    source,
                  })
                  return resolve
                },
              }),
            ]),
          ),
        ),
      ],
    ),
  )
  return Object.freeze(registry) as SchemaData<Fields>
}

export function authorize<P, A, R, C>(
  resolver: Resolver<P, A, R, C>,
  check: (input: ReadInput<P, A, C>) => void | Promise<void>,
): Resolver<P, A, R, C> {
  const wrapped = async (
    parent: P,
    args: A,
    context: C,
    info: GraphQLResolveInfo,
  ) => {
    await check({ parent, args, context, info })
    return resolver(parent, args, context, info)
  }
  inheritData(resolver, wrapped)
  return wrapped
}

export const data = Object.freeze({ loaded, missing, authorize })
