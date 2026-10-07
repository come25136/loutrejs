import type { ExecutionDefinition, ExecutionGroup } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  websocket,
  type WebSocketExecutionDefinition,
} from '@loutrejs/loutre/websocket'
import { createHandler } from 'graphql-http/lib/use/fetch'
import { serveGraphQLWebSocket } from './websocket.js'

import type { GraphQLEndpointDefinition } from './types.js'
export type {
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
  GraphQLContextInput,
  GraphQLRuntime,
  GraphQLEndpointDefinition,
} from './types.js'

type TransportExecution<
  TTransports,
  TKey extends PropertyKey,
  TExecution,
> = TKey extends keyof TTransports
  ? [Exclude<TTransports[TKey], false | undefined>] extends [never]
    ? never
    : TExecution
  : never

export type GraphQLEndpoint<
  TDefinition extends GraphQLEndpointDefinition = GraphQLEndpointDefinition,
> = ExecutionGroup<
  readonly (TDefinition extends { readonly transports: infer TTransports }
    ?
        | TransportExecution<
            TTransports,
            'http',
            ExecutionDefinition<typeof http.extension>
          >
        | TransportExecution<
            TTransports,
            'websocket',
            WebSocketExecutionDefinition
          >
    : ExecutionDefinition<typeof http.extension>)[]
>

const textSchema = {
  '~standard': {
    version: 1 as const,
    vendor: '@loutrejs/graphql',
    validate: (value: unknown) =>
      typeof value === 'string'
        ? { value }
        : { issues: [{ message: 'text messageが必要です。' }] },
    types: undefined as unknown as { input: string; output: string },
  },
}

export function defineGraphQLEndpoint<
  const TDefinition extends GraphQLEndpointDefinition,
>(definition: TDefinition): GraphQLEndpoint<TDefinition> {
  const transports = definition.transports ?? { http: true }
  if (!transports.http && !transports.websocket)
    throw new TypeError('GraphQL transportを一つ以上有効にしてください。')
  const executions: (
    | ExecutionDefinition<typeof http.extension>
    | WebSocketExecutionDefinition
  )[] = []
  if (transports.http) {
    executions.push(
      http.raw({
        name: `${definition.name}.http`,
        route: {
          method: '*',
          path: definition.path,
          protocol: 'graphql',
          ...(typeof transports.http === 'object' &&
          transports.http.middlewares !== undefined
            ? { middlewares: transports.http.middlewares }
            : {}),
        },
        factory: () => {
          const runtime = definition.factory?.() ?? {}
          return (context) =>
            createHandler<Record<string, unknown>>({
              schema: definition.schema,
              rootValue: runtime.rootValue,
              context: () =>
                runtime.context?.({
                  transport: 'http',
                  request: context.request,
                  signal: context.request.signal,
                  state: context.state,
                }) ?? {},
            })(context.request)
        },
      }),
    )
  }
  if (transports.websocket) {
    const options =
      typeof transports.websocket === 'object' ? transports.websocket : {}
    executions.push(
      websocket.implementation({
        name: `${definition.name}.websocket`,
        contract: websocket.contract({
          endpoint: {
            path: definition.path,
            handshake: { protocols: ['graphql-transport-ws'] },
            messages: websocket.text({ input: textSchema, output: textSchema }),
          },
        }),
        factory: () => {
          const runtime = definition.factory?.() ?? {}
          return {
            endpoint: (context) =>
              serveGraphQLWebSocket(
                context,
                definition.schema,
                runtime,
                options,
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
  }) as GraphQLEndpoint<TDefinition>
}

export const graphql = Object.freeze({ endpoint: defineGraphQLEndpoint })
