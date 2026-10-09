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
  type DocumentNode,
  type GraphQLFieldResolver,
  type GraphQLScalarType,
  type GraphQLTypeResolver,
  type GraphQLIsTypeOfFn,
  type GraphQLArgument,
  type GraphQLInputField,
} from 'graphql'
import { getData, type DataDefinition } from './data-internal.js'
import { storeManifest, type GraphQLManifest } from './manifest-internal.js'
import { validateEndpointSchema } from './validation.js'

export type { GraphQLManifest } from './manifest-internal.js'
export function bindManifest<Context extends object = object>(input: {
  readonly schemaDocument: DocumentNode
  readonly resolvers: object
  readonly fingerprint: string
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
      const scalar = binding as GraphQLScalarType
      for (const key of [
        'serialize',
        'parseValue',
        'parseLiteral',
        'coerceOutputValue',
        'coerceInputValue',
        'coerceInputLiteral',
        'specifiedByURL',
      ] as const) {
        const value = (scalar as unknown as Record<string, unknown>)[key]
        if (value !== undefined)
          (type as unknown as Record<string, unknown>)[key] = value
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
        type.resolveType = resolver as GraphQLTypeResolver<unknown, unknown>
        continue
      }
      if (fieldName === '__isTypeOf' && isObjectType(type)) {
        if (typeof resolver !== 'function')
          throw new TypeError(`${name}.__isTypeOfは関数にしてください。`)
        type.isTypeOf = resolver as GraphQLIsTypeOfFn<unknown, unknown>
        continue
      }
      const field = !isUnionType(type) && type.getFields()[fieldName]
      if (!field)
        throw new TypeError(
          `Schemaに存在しないResolver Fieldです: ${name}.${fieldName}`,
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
      field.resolve = resolve as
        | GraphQLFieldResolver<unknown, unknown>
        | undefined
      field.subscribe = subscribe as
        | GraphQLFieldResolver<unknown, unknown>
        | undefined
      const definition = getData(resolve)
      if (getData(subscribe))
        throw new TypeError(
          'Subscription Sourceは標準subscribe Resolverを使用してください。',
        )
      if (definition) {
        if (
          definition.identity !== `${name}.${fieldName}` ||
          definition.fingerprint !== input.fingerprint
        )
          throw new TypeError(
            `Data ResolverのField Identityまたは生成世代が一致しません: ${name}.${fieldName}`,
          )
        if (
          definition.kind === 'field' &&
          definition.options.requires?.some(
            (key) => typeof key !== 'string' || !key.length,
          )
        )
          throw new TypeError(`${name}.${fieldName}.requiresが不正です。`)
        metadata.set(definition.identity, definition)
      }
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
  return storeManifest({ schema, metadata, fingerprint: input.fingerprint })
}
