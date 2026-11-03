import { GraphQLError, type GraphQLFormattedError } from 'graphql'

type ErrorFormatter<TInput> = {
  formatError?(error: GraphQLError, input: TInput): GraphQLFormattedError
}

export function formatGraphQLError<TInput>(
  runtime: ErrorFormatter<TInput>,
  error: GraphQLError,
  input: TInput,
): GraphQLFormattedError {
  if (!runtime.formatError) return error.toJSON()
  const formatted = runtime.formatError(error, input)
  return {
    ...(error.locations ? { locations: error.locations } : {}),
    ...(error.path ? { path: error.path } : {}),
    ...formatted,
  }
}

export function formatHttpError<TInput>(
  runtime: ErrorFormatter<TInput>,
  error: Readonly<GraphQLError | Error>,
  input: TInput,
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
