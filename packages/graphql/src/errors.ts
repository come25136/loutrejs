import { GraphQLError, type GraphQLFormattedError } from 'graphql'
import type { GraphQLContextInput, GraphQLRuntime } from './types.js'

export function formatGraphQLError(
  runtime: GraphQLRuntime,
  error: GraphQLError,
  input: GraphQLContextInput,
): GraphQLFormattedError {
  if (!runtime.formatError) return error.toJSON()
  const formatted = runtime.formatError(error, input)
  return {
    ...(error.locations ? { locations: error.locations } : {}),
    ...(error.path ? { path: error.path } : {}),
    ...formatted,
  }
}

export function formatHttpError(
  runtime: GraphQLRuntime,
  error: Readonly<GraphQLError | Error>,
  input: GraphQLContextInput,
): GraphQLError | Error {
  if (!runtime.formatError) return error
  const graphqlError =
    error instanceof GraphQLError ? error : new GraphQLError(error.message)
  const formatted = formatGraphQLError(runtime, graphqlError, input)
  // graphql-httpのformatErrorはErrorを要求するため、整形済みJSONをtoJSONで渡す。
  return Object.assign(new GraphQLError(formatted.message), {
    toJSON: () => formatted,
  })
}
