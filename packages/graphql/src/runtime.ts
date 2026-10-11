import {
  buildASTSchema,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isScalarType,
  isEnumType,
  isInputObjectType,
  getNamedType,
  valueFromAST,
  type GraphQLFieldResolver,
  type GraphQLScalarType,
  type GraphQLTypeResolver,
  type GraphQLIsTypeOfFn,
  type GraphQLArgument,
  type GraphQLInputField,
  type DocumentNode,
} from 'graphql'
import {
  invokeData,
  registerSchemaMetadata,
  type DataDefinition,
} from './data-internal.js'
import { storeManifest, type GraphQLManifest } from './manifest-internal.js'
import { validateEndpointSchema } from './validation.js'
import type { Resolver, TypeResolverInput } from './data-types.js'

export type { GraphQLManifest } from './manifest-internal.js'
export function bindManifest<Context extends object = object>(input: {
  readonly schemaDocument: DocumentNode
  readonly resolvers: object
}): GraphQLManifest<Context> {
  const schema = buildASTSchema(input.schemaDocument)
  const metadata = new Map<string, DataDefinition>()
  if (!input.resolvers || typeof input.resolvers !== 'object')
    throw new TypeError('Resolver Moduleのresolvers exportが必要です。')
  for (const [name, binding] of Object.entries(input.resolvers)) {
    const type = schema.getType(name)
    if (!type || name.startsWith('__'))
      throw new TypeError(`Schemaに存在しないResolver Typeです: ${name}`)
    if (isScalarType(type)) {
      if (!binding || typeof binding !== 'object')
        throw new TypeError(`${name}にScalar Resolverが必要です。`)
      const scalar = binding as Partial<GraphQLScalarType>
      for (const key of [
        'serialize',
        'parseValue',
        'parseLiteral',
        'coerceOutputValue',
        'coerceInputValue',
        'coerceInputLiteral',
        'specifiedByURL',
      ] as const) {
        copyScalarProperty(type, scalar, key)
      }
      continue
    }
    if (isEnumType(type)) {
      for (const [key, value] of Object.entries(binding)) {
        const item = type
          .getValues()
          .find((candidate) => candidate.name === key)
        if (!item)
          throw new TypeError(`Schemaに存在しないenum値です: ${name}.${key}`)
        item.value = value
      }
      continue
    }
    if (!isObjectType(type) && !isInterfaceType(type) && !isUnionType(type))
      throw new TypeError(`${name}にはResolverを登録できません。`)
    if (!binding || typeof binding !== 'object')
      throw new TypeError(`${name}のResolverはobjectにしてください。`)
    for (const [fieldName, resolver] of Object.entries(binding)) {
      if (
        fieldName === '__resolveType' &&
        (isInterfaceType(type) || isUnionType(type))
      ) {
        if (typeof resolver !== 'function')
          throw new TypeError(`${name}.__resolveTypeは関数にしてください。`)
        const resolveType = resolver as (
          input: TypeResolverInput<unknown, unknown>,
        ) => ReturnType<GraphQLTypeResolver<unknown, unknown>>
        type.resolveType = (parent, context, info) =>
          resolveType({ parent, context, info })
        continue
      }
      if (fieldName === '__isTypeOf' && isObjectType(type)) {
        if (typeof resolver !== 'function')
          throw new TypeError(`${name}.__isTypeOfは関数にしてください。`)
        const isTypeOf = resolver as (
          input: TypeResolverInput<unknown, unknown>,
        ) => ReturnType<GraphQLIsTypeOfFn<unknown, unknown>>
        type.isTypeOf = (parent, context, info) =>
          isTypeOf({ parent, context, info })
        continue
      }
      const field = !isUnionType(type) && type.getFields()[fieldName]
      if (!field)
        throw new TypeError(
          `Schemaに存在しないResolver Fieldです: ${name}.${fieldName}`,
        )
      if (resolver && typeof resolver === 'object' && 'load' in resolver) {
        if ('resolve' in resolver || 'subscribe' in resolver)
          throw new TypeError(
            `${name}.${fieldName}のloadとresolve / subscribeは併用できません。`,
          )
        if (schema.getSubscriptionType() === type)
          throw new TypeError(
            'Subscriptionのroot Fieldは標準subscribe / resolve Resolverを使用してください。',
          )
        const options = resolver as DataDefinition['options']
        if (typeof options.load !== 'function')
          throw new TypeError(`${name}.${fieldName}.loadは関数にしてください。`)
        if (
          options.maxBatchSize !== undefined &&
          (!Number.isSafeInteger(options.maxBatchSize) ||
            options.maxBatchSize < 1)
        )
          throw new TypeError(
            `${name}.${fieldName}.maxBatchSizeは正の整数にしてください。`,
          )
        if (
          options.requires !== undefined &&
          (!Array.isArray(options.requires) ||
            options.requires.some(
              (key) => typeof key !== 'string' || !key.length,
            ))
        )
          throw new TypeError(`${name}.${fieldName}.requiresが不正です。`)
        for (const key of ['authorize', 'read'] as const)
          if (options[key] !== undefined && typeof options[key] !== 'function')
            throw new TypeError(
              `${name}.${fieldName}.${key}は関数にしてください。`,
            )
        const definition: DataDefinition = Object.freeze({
          identity: `${name}.${fieldName}`,
          options: Object.freeze({
            ...options,
            requires: Object.freeze([...(options.requires ?? [])]),
          }),
        })
        field.resolve = (parent, args, context, info) =>
          invokeData(definition, parent, args, context, info)
        metadata.set(definition.identity, definition)
        continue
      }
      if (
        resolver &&
        typeof resolver === 'object' &&
        ['requires', 'read', 'authorize', 'maxBatchSize'].some(
          (key) => key in resolver,
        )
      )
        throw new TypeError(
          `${name}.${fieldName}のBatch設定にはloadが必要です。`,
        )
      const object = resolver as
        | { resolve?: unknown; subscribe?: unknown }
        | undefined
      const resolve =
        typeof resolver === 'function' ? resolver : object?.resolve
      const subscribe =
        typeof resolver === 'object' ? object?.subscribe : undefined
      if (resolve !== undefined && typeof resolve !== 'function')
        throw new TypeError(
          `${name}.${fieldName}.resolveは関数にしてください。`,
        )
      if (subscribe !== undefined && typeof subscribe !== 'function')
        throw new TypeError(
          `${name}.${fieldName}.subscribeは関数にしてください。`,
        )
      if (!resolve && !subscribe)
        throw new TypeError(`${name}.${fieldName}のResolverが不正です。`)
      field.resolve = resolve ? fieldResolver(resolve) : undefined
      field.subscribe = subscribe ? fieldResolver(subscribe) : undefined
    }
  }
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type)) continue
    for (const contract of type.getInterfaces()) {
      for (const [name, field] of Object.entries(contract.getFields())) {
        const target = type.getFields()[name]!
        if (!target.resolve && field.resolve) {
          target.resolve = field.resolve
          const definition = metadata.get(`${contract.name}.${name}`)
          if (definition) metadata.set(`${type.name}.${name}`, definition)
        }
      }
    }
  }
  const visited = new Set<string>()
  const defaults = (field: GraphQLArgument | GraphQLInputField) => {
    const type = getNamedType(field.type)
    if (isInputObjectType(type) && !visited.has(type.name)) {
      visited.add(type.name)
      for (const child of Object.values(type.getFields())) defaults(child)
    }
    if (!field.astNode?.defaultValue) return
    // v17はAST defaultを遅延coerceするため、v16の値へ置き換えない。
    if (!Object.hasOwn(field, 'default'))
      field.defaultValue = valueFromAST(field.astNode.defaultValue, field.type)
  }
  for (const type of Object.values(schema.getTypeMap())) {
    if (isInputObjectType(type)) {
      for (const field of Object.values(type.getFields())) defaults(field)
    } else if (isObjectType(type) || isInterfaceType(type)) {
      for (const field of Object.values(type.getFields()))
        for (const argument of field.args) defaults(argument)
    }
  }
  validateEndpointSchema(schema)
  registerSchemaMetadata(schema, metadata)
  return storeManifest({ schema, metadata })
}

function fieldResolver(
  callback: Function,
): GraphQLFieldResolver<unknown, unknown> {
  const resolver = callback as Resolver<unknown, unknown, unknown, unknown>
  return (parent, args, context, info) =>
    resolver({ parent, args, context, info })
}

function copyScalarProperty<Key extends keyof GraphQLScalarType>(
  target: GraphQLScalarType,
  source: Partial<GraphQLScalarType>,
  key: Key,
) {
  const value = source[key]
  if (value !== undefined) target[key] = value
}
