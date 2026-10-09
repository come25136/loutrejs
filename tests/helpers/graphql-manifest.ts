import {
  parse,
  printSchema,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isScalarType,
  isSpecifiedScalarType,
  type GraphQLSchema,
} from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'

export function manifestFromSchema(schema: GraphQLSchema) {
  const resolvers: Record<string, unknown> = {}
  for (const type of Object.values(schema.getTypeMap())) {
    if (type.name.startsWith('__')) continue
    if (isScalarType(type) && !isSpecifiedScalarType(type))
      resolvers[type.name] = type
    if (isObjectType(type) || isInterfaceType(type)) {
      const fields = Object.fromEntries(
        Object.entries(type.getFields())
          .filter(([, field]) => field.resolve || field.subscribe)
          .map(([name, field]) => [
            name,
            field.subscribe
              ? { resolve: field.resolve, subscribe: field.subscribe }
              : field.resolve,
          ]),
      )
      if (Object.keys(fields).length) resolvers[type.name] = fields
    }
    if ((isInterfaceType(type) || isUnionType(type)) && type.resolveType)
      resolvers[type.name] = {
        ...(resolvers[type.name] as object),
        __resolveType: type.resolveType,
      }
  }
  return bindManifest({
    schemaDocument: parse(printSchema(schema), { noLocation: true }),
    resolvers,
    fingerprint: 'test',
  })
}
