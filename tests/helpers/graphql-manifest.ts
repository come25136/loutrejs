import {
  parse,
  printSchema,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isScalarType,
  isSpecifiedScalarType,
  type GraphQLSchema,
  type GraphQLFieldResolver,
} from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import type { ResolverInput, TypeResolverInput } from '@loutrejs/graphql/data'

function fieldResolver(
  resolver: GraphQLFieldResolver<unknown, unknown> | undefined,
) {
  return resolver
    ? ({
        parent,
        args,
        context,
        info,
      }: ResolverInput<unknown, Record<string, unknown>, unknown>) =>
        resolver(parent, args, context, info)
    : undefined
}

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
              ? {
                  resolve: fieldResolver(field.resolve),
                  subscribe: fieldResolver(field.subscribe),
                }
              : fieldResolver(field.resolve),
          ]),
      )
      if (Object.keys(fields).length) resolvers[type.name] = fields
    }
    if ((isInterfaceType(type) || isUnionType(type)) && type.resolveType)
      resolvers[type.name] = {
        ...(resolvers[type.name] as object),
        __resolveType: ({
          parent,
          context,
          info,
        }: TypeResolverInput<unknown, unknown>) =>
          type.resolveType!(parent, context, info, type),
      }
    if (isObjectType(type) && type.isTypeOf)
      resolvers[type.name] = {
        ...(resolvers[type.name] as object),
        __isTypeOf: ({
          parent,
          context,
          info,
        }: TypeResolverInput<unknown, unknown>) =>
          type.isTypeOf!(parent, context, info),
      }
  }
  return bindManifest({
    schemaDocument: parse(printSchema(schema), { noLocation: true }),
    resolvers,
  })
}
