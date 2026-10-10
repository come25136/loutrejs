import type { HttpRawDefinition } from '@loutrejs/loutre/http'
import type { GraphQLManifest } from './manifest-internal.js'
import type { GraphQLError, GraphQLFormattedError } from 'graphql'

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

export interface GraphQLRuntime<TContext extends object = object> {
  context(input: GraphQLContextInput): TContext | Promise<TContext>
  formatError?(
    error: GraphQLError,
    input: GraphQLContextInput,
  ): GraphQLFormattedError
  // 既存のfactoryから構造的型付けで旧指定が紛れ込むことも拒否する。
  readonly rootValue?: never
}

export interface GraphQLEndpointDefinition<TContext extends object = object> {
  readonly name: string
  readonly path: string
  readonly manifest: GraphQLManifest<TContext>
  readonly schema?: never
  readonly transports?: {
    readonly http?:
      | boolean
      | { readonly middlewares?: HttpRawDefinition['route']['middlewares'] }
    readonly websocket?:
      | boolean
      | { readonly connectionInitWaitTimeout?: number }
  }
  readonly factory: () => GraphQLRuntime<TContext>
}
