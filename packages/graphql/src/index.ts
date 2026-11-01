import type {
  ExecutionDefinition,
  ExecutionGroup,
  StandardSchemaV1,
  LayerState,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  websocket,
  type WebSocketExecutionDefinition,
} from '@loutrejs/loutre/websocket'
import { createHandler } from 'graphql-http/lib/use/fetch'
import { captureDependencyResolver } from '@loutrejs/loutre'
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

import type {
  GraphQLConnectionInitMiddleware,
  GraphQLEndpointDefinition,
} from './types.js'
export type {
  GraphQLConnectionInitContext,
  GraphQLConnectionInitMiddleware,
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
  GraphQLWebSocketExtra,
  GraphQLWebSocketHooks,
  GraphQLContextInput,
  GraphQLRuntime,
  GraphQLEndpointDefinition,
} from './types.js'
export type { GraphQLManifest } from './manifest-internal.js'
export * from './data.js'

type HttpOptions = GraphQLEndpointDefinition['http']
type WebSocketOptions = GraphQLEndpointDefinition['ws']
type Enabled<T> = [Exclude<T, false | undefined>] extends [never] ? false : true
type HttpEnabled<THttp, TWs> = [THttp] extends [undefined]
  ? [TWs] extends [undefined]
    ? true
    : false
  : Enabled<THttp>

type HttpState<THttp> = THttp extends {
  readonly middlewares: infer TLayers extends NonNullable<
    Exclude<HttpOptions, boolean | undefined>['middlewares']
  >
}
  ? LayerState<TLayers>
  : {}
type ConnectionInitState<TWs> = TWs extends {
  readonly connectionInit: infer TLayers extends
    readonly GraphQLConnectionInitMiddleware[]
}
  ? LayerState<TLayers>
  : {}
type EndpointInput<THttp, TWs> =
  | (HttpEnabled<THttp, TWs> extends true
      ? GraphQLHttpContextInput<HttpState<THttp>>
      : never)
  | (Enabled<TWs> extends true
      ? GraphQLWebSocketContextInput<ConnectionInitState<TWs>>
      : never)

export type GraphQLEndpoint<
  THttp extends HttpOptions = undefined,
  TWs extends WebSocketOptions = undefined,
> = ExecutionGroup<
  readonly (
    | (HttpEnabled<THttp, TWs> extends true
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
        : { issues: [{ message: 'text messageが必要です。' }] },
  },
}

export function defineGraphQLEndpoint<
  TContext extends object,
  const THttp extends HttpOptions = undefined,
  const TWs extends WebSocketOptions = undefined,
>(
  definition: Omit<
    GraphQLEndpointDefinition<TContext>,
    'factory' | 'http' | 'ws'
  > & {
    readonly http?: THttp
    readonly ws?: TWs
    readonly factory: () => GraphQLRuntime<
      NoInfer<TContext>,
      EndpointInput<THttp, TWs>
    >
  },
): GraphQLEndpoint<THttp, TWs> {
  if (typeof definition.factory !== 'function')
    throw new TypeError('GraphQL endpointにfactoryが必要です。')
  if ('schema' in definition)
    throw new TypeError(
      'schemaは廃止しました。CLIが生成したmanifestを指定してください。',
    )
  const bound = getManifest(definition.manifest)
  validateEndpointSchema(bound.schema)
  const httpOptions: HttpOptions =
    definition.http ?? definition.ws === undefined
  const wsOptions: WebSocketOptions = definition.ws ?? false
  if (!httpOptions && !wsOptions)
    throw new TypeError('GraphQLのHTTPかWSを一つ以上有効にしてください。')
  const executions: (
    | ExecutionDefinition<typeof http.extension>
    | WebSocketExecutionDefinition
  )[] = []
  if (httpOptions) {
    executions.push(
      http.raw({
        name: `${definition.name}.http`,
        route: {
          method: '*',
          path: definition.path,
          protocol: 'graphql',
          middlewares:
            typeof httpOptions === 'object'
              ? (httpOptions.middlewares ?? [])
              : [],
        },
        factory: () => {
          const runtime = validateRuntime(definition.factory())
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
    const connectionInit = options.connectionInit ?? []
    executions.push(
      websocket.implementation({
        name: `${definition.name}.websocket`,
        layers: connectionInit,
        contract: websocket.contract({
          endpoint: {
            path: definition.path,
            handshake: { protocols: ['graphql-transport-ws'] },
            messages: websocket.text({ input: textSchema, output: textSchema }),
          },
        }),
        factory: () => {
          const runtime = validateRuntime(definition.factory())
          const resolve = captureDependencyResolver()
          return {
            endpoint: (context) =>
              serveGraphQLWebSocket(
                context,
                bound,
                runtime,
                options,
                connectionInit,
                resolve,
              ),
          }
        },
      }) as WebSocketExecutionDefinition,
    )
  }
  return Object.freeze({
    kind: 'execution-group',
    name: definition.name,
    executions: Object.freeze(executions),
  }) as GraphQLEndpoint<THttp, TWs>
}

export const graphql = Object.freeze({ endpoint: defineGraphQLEndpoint })
