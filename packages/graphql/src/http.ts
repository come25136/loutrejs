import { createHandler } from 'graphql-http/lib/use/fetch'
import type { HttpRawExecutionContext } from '@loutrejs/loutre/http'
import type { BoundManifest } from './manifest-internal.js'
import type {
  GraphQLHttpContextInput,
  GraphQLProtocolRuntime,
} from './types.js'
import { executeManifest } from './execution.js'
import { formatHttpError } from './errors.js'

export function createGraphQLHttpHandler(
  bound: BoundManifest,
  runtime: GraphQLProtocolRuntime,
) {
  return async (context: HttpRawExecutionContext): Promise<Response> => {
    const input: GraphQLHttpContextInput<object> = {
      transport: 'http',
      request: context.request,
      signal: context.signal,
      state: context.state,
    }
    let requestError = false
    const response = await createHandler<{}>({
      schema: bound.schema,
      formatError: (error) => formatHttpError(runtime, error, input),
      execute: async (args) => {
        const operation = context.execution.beginOperation({
          kind: 'graphql.operation',
          name: args.operationName ?? 'GraphQL',
        })
        operation.annotate?.({ 'graphql.transport': 'http' })
        try {
          const invoke = () =>
            executeManifest(bound, args, {
              signal: context.signal,
              annotate: (attributes) => operation.annotate?.(attributes),
            })
          const result = await (operation.run
            ? operation.run(invoke)
            : invoke())
          requestError = result.data === undefined && !!result.errors?.length
          return result
        } finally {
          operation.complete()
        }
      },
      context: () => runtime.context(input),
    })(context.request)
    if (
      requestError &&
      response.status === 200 &&
      response.headers
        .get('content-type')
        ?.startsWith('application/graphql-response+json')
    ) {
      return new Response(response.body, {
        status: 400,
        statusText: 'Bad Request',
        headers: response.headers,
      })
    }
    return response
  }
}
