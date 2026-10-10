import {
  assertValidSchema,
  GraphQLScalarType,
  isScalarType,
  isSpecifiedScalarType,
  type GraphQLSchema,
} from 'graphql'
import type { GraphQLRuntime } from './types.js'

const outputCoercion = (type: {
  readonly serialize: unknown
  readonly coerceOutputValue?: unknown
}) => type.coerceOutputValue ?? type.serialize

export function validateEndpointSchema(schema: GraphQLSchema) {
  assertValidSchema(schema)
  const defaults = new GraphQLScalarType({ name: 'LoutreScalarDefaults' })
  for (const type of Object.values(schema.getTypeMap())) {
    if (
      isScalarType(type) &&
      !isSpecifiedScalarType(type) &&
      outputCoercion(type) === outputCoercion(defaults)
    )
      throw new TypeError(
        `${type.name}にscalarの出力coercionを登録してください。`,
      )
  }
  for (const root of [schema.getQueryType(), schema.getMutationType()]) {
    for (const field of Object.values(root?.getFields() ?? {})) {
      if (typeof field.resolve !== 'function')
        throw new TypeError(`${root!.name}.${field.name}にresolveが必要です。`)
    }
  }
  const subscription = schema.getSubscriptionType()
  for (const field of Object.values(subscription?.getFields() ?? {})) {
    if (
      typeof field.subscribe !== 'function' ||
      typeof field.resolve !== 'function'
    )
      throw new TypeError(
        `${subscription!.name}.${field.name}にsubscribeとresolveが必要です。`,
      )
  }
}

export function validateRuntime(runtime: GraphQLRuntime): GraphQLRuntime {
  if (!runtime || typeof runtime.context !== 'function')
    throw new TypeError('GraphQL factoryはcontext関数を返してください。')
  if ('rootValue' in runtime)
    throw new TypeError(
      'rootValueは廃止しました。schemaへresolve / subscribeを登録してください。',
    )
  if (
    runtime.formatError !== undefined &&
    typeof runtime.formatError !== 'function'
  )
    throw new TypeError('GraphQL formatErrorは関数を指定してください。')
  return runtime
}
