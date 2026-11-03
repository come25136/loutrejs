import type {
  ExecutionDefinition,
  ExecutionGroup,
  StandardSchemaV1,
  LayerState,
} from '@loutrejs/loutre'
import {
  http,
  isHttpRawContractRoute,
  type HttpContractRawRoute,
} from '@loutrejs/loutre/http'
import { inheritSourceLocation } from '@loutrejs/loutre'
import {
  websocket,
  type WebSocketExecutionDefinition,
} from '@loutrejs/loutre/websocket'
import { createHandler } from 'graphql-http/lib/use/fetch'
import { serveGraphQLWebSocket } from './websocket.js'
import { validateEndpointSchema, validateRuntime } from './validation.js'
import { getManifest } from './manifest-internal.js'
import type { GraphQLRuntime } from './types.js'
import { executeManifest } from './execution.js'
import { formatHttpError } from './errors.js'
import type {
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
} from './types.js'

import type { GraphQLImplementationDefinition } from './types.js'
export type {
  GraphQLConnectionInitContext,
  GraphQLConnectionInitHandler,
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
  GraphQLWebSocketExtra,
  GraphQLWebSocketHooks,
  GraphQLContextInput,
  GraphQLRuntime,
  GraphQLImplementationDefinition,
} from './types.js'
export type { GraphQLManifest } from './manifest-internal.js'
export * from './data.js'
export { ConnectionRejected } from './connection-rejected.js'

type Transports = NonNullable<GraphQLImplementationDefinition['transports']>
type HttpOptions = Transports['http']
type WebSocketOptions = Transports['websocket']
type Enabled<T> = [Exclude<T, false | undefined>] extends [never] ? false : true
type HttpEnabled<THttp> = [THttp] extends [undefined] ? true : Enabled<THttp>

type HttpState<TRoute> = TRoute extends {
  readonly middlewares: infer TLayers extends NonNullable<
    HttpContractRawRoute['middlewares']
  >
}
  ? LayerState<TLayers>
  : {}

type ImplementationInput<TRoute, THttp, TWs, TState extends object> =
  | (HttpEnabled<THttp> extends true
      ? GraphQLHttpContextInput<HttpState<TRoute>>
      : never)
  | (Enabled<TWs> extends true ? GraphQLWebSocketContextInput<TState> : never)

export type GraphQLImplementation<
  THttp extends HttpOptions = undefined,
  TWs extends WebSocketOptions = undefined,
> = ExecutionGroup<
  readonly (
    | (HttpEnabled<THttp> extends true
        ? ExecutionDefinition<typeof http.extension>
        : never)
    | (Enabled<TWs> extends true ? WebSocketExecutionDefinition : never)
  )[]
>

const textSchema: StandardSchemaV1<string, string> = {
  '~standard': {
    version: 1 as const,
    vendor: '@loutrejs/graphql',
    validate: (value: unknown) =>
      typeof value === 'string'
        ? { value }
        : { issues: [{ message: 'A text message is required.' }] },
  },
}

export function defineGraphQLImplementation<
  TContext extends object,
  const TRoute extends HttpContractRawRoute,
  const THttp extends HttpOptions = undefined,
  const TWs extends WebSocketOptions = undefined,
  TState extends object = HttpState<TRoute>,
>(
  definition: Omit<
    GraphQLImplementationDefinition<TContext>,
    'factory' | 'route' | 'transports'
  > & {
    readonly route: TRoute
    readonly transports?: {
      readonly http?: THttp
      readonly websocket?: TWs
    }
    readonly factory: () => GraphQLRuntime<
      NoInfer<TContext>,
      ImplementationInput<TRoute, THttp, TWs, NoInfer<TState>>,
      TState,
      HttpState<TRoute>
    > &
      (Enabled<TWs> extends true ? {} : { readonly ws?: never })
  },
): GraphQLImplementation<THttp, TWs> {
  if (typeof definition.factory !== 'function')
    throw new TypeError('GraphQL implementation requires a factory.')
  if ('schema' in definition)
    throw new TypeError(
      'The schema option is not supported. Use a CLI-generated manifest.',
    )
  if (!isHttpRawContractRoute(definition.route))
    throw new TypeError(
      'GraphQL implementation requires a raw route from an HTTP contract.',
    )
  if ('path' in definition)
    throw new TypeError('Define the GraphQL path in the HTTP contract.')
  if ('http' in definition || 'ws' in definition)
    throw new TypeError(
      'Configure GraphQL transports with transports.http and transports.websocket.',
    )

  const bound = getManifest(definition.manifest)
  validateEndpointSchema(bound.schema)

  const httpOptions: HttpOptions = definition.transports?.http ?? true
  const wsOptions: WebSocketOptions = definition.transports?.websocket ?? false
  if (wsOptions && !['GET', '*'].includes(definition.route.method))
    throw new TypeError(
      'GraphQL WebSocket routes must use GET or * in the HTTP contract.',
    )
  if (!httpOptions && !wsOptions)
    throw new TypeError(
      'Enable at least one GraphQL transport: HTTP or WebSocket.',
    )

  const executions: (
    | ExecutionDefinition<typeof http.extension>
    | WebSocketExecutionDefinition
  )[] = []

  if (httpOptions) {
    executions.push(
      http.raw({
        name: `${definition.name}.http`,
        route: inheritSourceLocation(
          { ...definition.route, protocol: 'graphql' },
          definition.route,
        ),
        factory: () => {
          const runtime = validateRuntime(definition.factory(), !!wsOptions)

          return async (context) => {
            const input: GraphQLHttpContextInput = {
              transport: 'http',
              request: context.request,
              signal: context.request.signal,
              state: context.state,
            }
            let requestError = false
            const response = await createHandler<Record<string, unknown>>({
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
                      signal: context.request.signal,
                      annotate: (attributes) =>
                        operation.annotate?.(attributes),
                    })
                  const result = await (operation.run
                    ? operation.run(invoke)
                    : invoke())
                  requestError =
                    result.data === undefined && !!result.errors?.length
                  return result
                } finally {
                  operation.complete()
                }
              },
              context: async () =>
                (await runtime.context(input)) as Record<string, unknown>,
            })(context.request)
            if (
              requestError &&
              response.status === 200 &&
              response.headers
                .get('content-type')
                ?.startsWith('application/graphql-response+json')
            )
              return new Response(response.body, {
                status: 400,
                statusText: 'Bad Request',
                headers: response.headers,
              })
            return response
          }
        },
      }),
    )
  }

  if (wsOptions) {
    const options = typeof wsOptions === 'object' ? wsOptions : {}
    executions.push(
      websocket.implementation({
        name: `${definition.name}.websocket`,
        contract: websocket.contract({
          endpoint: {
            path: definition.route.path,
            handshake: {
              protocols: ['graphql-transport-ws'],
              middlewares: definition.route.middlewares ?? [],
            },
            messages: websocket.text({ input: textSchema, output: textSchema }),
          },
        }),
        factory: () => {
          const runtime = validateRuntime(definition.factory(), !!wsOptions)

          return {
            endpoint: (context) =>
              serveGraphQLWebSocket(context, bound, runtime, options),
          }
        },
      }) as WebSocketExecutionDefinition,
    )
  }

  return Object.freeze({
    kind: 'execution-group',
    name: definition.name,
    executions: Object.freeze(executions),
  }) as GraphQLImplementation<THttp, TWs>
}

export const graphql = Object.freeze({
  implementation: defineGraphQLImplementation,
})
