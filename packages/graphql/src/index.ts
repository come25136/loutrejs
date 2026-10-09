import type { ExecutionDefinition, ExecutionGroup } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  websocket,
  type WebSocketExecutionDefinition,
} from '@loutrejs/loutre/websocket'
import { createHandler } from 'graphql-http/lib/use/fetch'
import { serveGraphQLWebSocket } from './websocket.js'
import { validateEndpointSchema, validateRuntime } from './validation.js'
import { getManifest } from './manifest-internal.js'
import type { GraphQLManifest } from './manifest-internal.js'
import type { GraphQLRuntime } from './types.js'
import { executeManifest } from './execution.js'

import type { GraphQLEndpointDefinition } from './types.js'
export type {
  GraphQLHttpContextInput,
  GraphQLWebSocketContextInput,
  GraphQLContextInput,
  GraphQLRuntime,
  GraphQLEndpointDefinition,
} from './types.js'
export type { GraphQLManifest } from './manifest-internal.js'

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
>(
  definition: TDefinition & {
    readonly factory: () => GraphQLRuntime<
      TDefinition['manifest'] extends GraphQLManifest<infer Context>
        ? Context
        : never
    >
  },
): GraphQLEndpoint<TDefinition> {
  if (typeof definition.factory !== 'function')
    throw new TypeError('GraphQL endpointにfactoryが必要です。')
  if ('schema' in definition)
    throw new TypeError(
      'schemaは廃止しました。CLIが生成したmanifestを指定してください。',
    )
  const bound = getManifest(definition.manifest)
  validateEndpointSchema(bound.schema)
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
          const runtime = validateRuntime(definition.factory())
          return (context) =>
            createHandler<Record<string, unknown>>({
              schema: bound.schema,
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
                  return await (operation.run
                    ? operation.run(invoke)
                    : invoke())
                } finally {
                  operation.complete()
                }
              },
              context: async () =>
                (await runtime.context({
                  transport: 'http',
                  request: context.request,
                  signal: context.request.signal,
                  state: context.state,
                })) as Record<string, unknown>,
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
          const runtime = validateRuntime(definition.factory())
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
  }) as GraphQLEndpoint<TDefinition>
}

export const graphql = Object.freeze({ endpoint: defineGraphQLEndpoint })
