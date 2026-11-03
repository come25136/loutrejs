import {
  assertValidSchema,
  GraphQLScalarType,
  isScalarType,
  isSpecifiedScalarType,
  type GraphQLSchema,
} from 'graphql'

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
      throw new TypeError(`${type.name} must define scalar output coercion.`)
  }

  for (const root of [schema.getQueryType(), schema.getMutationType()]) {
    for (const field of Object.values(root?.getFields() ?? {})) {
      if (typeof field.resolve !== 'function')
        throw new TypeError(
          `${root!.name}.${field.name} requires a resolve function.`,
        )
    }
  }

  const subscription = schema.getSubscriptionType()
  for (const field of Object.values(subscription?.getFields() ?? {})) {
    if (
      typeof field.subscribe !== 'function' ||
      typeof field.resolve !== 'function'
    )
      throw new TypeError(
        `${subscription!.name}.${field.name} requires subscribe and resolve functions.`,
      )
  }
}

export function validateRuntime<
  T extends { context: unknown; ws?: unknown; formatError?: unknown },
>(runtime: T, wsEnabled: boolean): T {
  if (!runtime || typeof runtime.context !== 'function')
    throw new TypeError('GraphQL factory must return a context function.')
  if ('rootValue' in runtime)
    throw new TypeError(
      'The rootValue option is not supported. Register resolve / subscribe functions on the schema.',
    )

  if (runtime.ws !== undefined) {
    if (!wsEnabled)
      throw new TypeError(
        'Enable transports.websocket before defining factory.ws.',
      )
    if (runtime.ws === null || typeof runtime.ws !== 'object')
      throw new TypeError(
        'GraphQL ws must be an object containing connection hooks.',
      )

    for (const [name, hook] of Object.entries(runtime.ws)) {
      if (!['connectionInit', 'onDisconnect', 'onClose'].includes(name))
        throw new TypeError(
          `GraphQL ws.${name} is not a supported connection hook.`,
        )
      if (hook !== undefined && typeof hook !== 'function')
        throw new TypeError(`GraphQL ws.${name} must be a function.`)
    }
  }

  if (
    runtime.formatError !== undefined &&
    typeof runtime.formatError !== 'function'
  )
    throw new TypeError('GraphQL formatError must be a function.')

  return runtime
}
