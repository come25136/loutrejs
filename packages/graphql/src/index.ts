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
import {
  defineExecution,
  delegateExecution,
  inheritSourceLocation,
} from '@loutrejs/loutre'
import {
  websocket,
  type WebSocketExecutionDefinition,
} from '@loutrejs/loutre/websocket'
import { serveGraphQLWebSocket } from './websocket.js'
import { validateEndpointSchema, validateRuntime } from './validation.js'
import { getManifest } from './manifest-internal.js'
import type { GraphQLRuntime } from './types.js'
import { createGraphQLHttpHandler } from './http.js'
import {
  graphqlExtension,
  type GraphQLEndpointDefinition,
} from './extension.js'
import { type GraphQLEndpointHandlers } from './compiled.js'
import type {
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
  GraphQLProtocolRuntime,
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
    | GraphQLEndpointDefinition
    | (HttpEnabled<THttp> extends true
        ? ExecutionDefinition<typeof http.extension>
        : never)
    | (Enabled<TWs> extends true ? WebSocketExecutionDefinition : never)
  )[]
>

const textSchema: StandardSchemaV1<string, string> = {
  '~standard': {
    version: 1,
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
): GraphQLImplementation<THttp, TWs>
export function defineGraphQLImplementation(
  definition: Omit<
    GraphQLImplementationDefinition,
    'factory' | 'transports'
  > & {
    readonly factory: () => GraphQLProtocolRuntime
    readonly transports?: {
      readonly http?: HttpOptions
      readonly websocket?: WebSocketOptions
    }
  },
): ExecutionGroup {
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

  const endpoint = defineExecution(graphqlExtension, {
    name: definition.name,
    path: definition.route.path,
    http: httpOptions,
    websocket: !!wsOptions,
    factory: (): GraphQLEndpointHandlers => {
      const runtime = validateRuntime(definition.factory(), !!wsOptions)
      return {
        http: createGraphQLHttpHandler(bound, runtime),
        websocket: {
          endpoint: (context) =>
            serveGraphQLWebSocket(
              context,
              bound,
              runtime,
              typeof wsOptions === 'object' ? wsOptions : {},
            ),
        },
      }
    },
  })
  const executions: ExecutionDefinition[] = [endpoint]
  if (httpOptions) {
    executions.push(
      http.delegate({
        name: `${definition.name}.http`,
        route: inheritSourceLocation(
          { ...definition.route, protocol: 'graphql' },
          definition.route,
        ),
        delegate: delegateExecution(
          endpoint,
          (runtime, id) => runtime.endpoint(id).http,
        ),
      }),
    )
  }
  if (wsOptions) {
    executions.push(
      websocket.delegate({
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
        delegate: delegateExecution(
          endpoint,
          (runtime, id) => runtime.endpoint(id).websocket,
        ),
      }),
    )
  }

  return Object.freeze({
    kind: 'execution-group',
    name: definition.name,
    executions: Object.freeze(executions),
  })
}

export const graphql = Object.freeze({
  implementation: defineGraphQLImplementation,
})

export type {
  GraphQLTypeName,
  GraphQLFieldName,
  GraphQLFieldCoordinate,
  GraphQLResponseKey,
  GraphQLOperationId,
} from './identity.js'
