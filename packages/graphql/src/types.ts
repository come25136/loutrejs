import type { HttpRawDefinition } from '@loutrejs/loutre/http'
import type { GraphQLSchema } from 'graphql'

export interface GraphQLHttpContextInput {
  readonly transport: 'http'
  readonly request: Request
  readonly signal: AbortSignal
  readonly state: Readonly<Record<string, unknown>>
}

export interface GraphQLWebSocketContextInput {
  readonly transport: 'websocket'
  readonly request: Request
  readonly connectionParams: Readonly<Record<string, unknown>> | undefined
  readonly operationId: string
  readonly signal: AbortSignal
}

export type GraphQLContextInput =
  | GraphQLHttpContextInput
  | GraphQLWebSocketContextInput

export interface GraphQLRuntime<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  context?(input: GraphQLContextInput): TContext | Promise<TContext>
  readonly rootValue?: unknown
}

export interface GraphQLEndpointDefinition<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string
  readonly path: string
  readonly schema: GraphQLSchema
  readonly transports?: {
    readonly http?:
      | boolean
      | { readonly middlewares?: HttpRawDefinition['route']['middlewares'] }
    readonly websocket?:
      | boolean
      | { readonly connectionInitWaitTimeout?: number }
  }
  readonly factory?: () => GraphQLRuntime<TContext>
}
