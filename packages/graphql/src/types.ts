import type { ServerOptions } from 'graphql-ws'
import type { HttpRawDefinition } from '@loutrejs/loutre/http'
import type { GraphQLManifest } from './manifest-internal.js'
import type { GraphQLError, GraphQLFormattedError } from 'graphql'

export interface GraphQLHttpContextInput<
  TState extends object = Record<string, unknown>,
> {
  readonly transport: 'http'
  readonly request: Request
  readonly signal: AbortSignal
  readonly state: Readonly<TState>
}

export interface GraphQLWebSocketContextInput<
  TState extends object = Record<string, unknown>,
> {
  readonly state: Readonly<TState>
  readonly transport: 'websocket'
  readonly request: Request
  readonly connectionParams: Readonly<Record<string, unknown>> | undefined
  readonly operationId: string
  readonly signal: AbortSignal
}

export type GraphQLContextInput<
  THttpState extends object = Record<string, unknown>,
  TWebSocketState extends object = Record<string, unknown>,
> =
  | GraphQLHttpContextInput<THttpState>
  | GraphQLWebSocketContextInput<TWebSocketState>

export interface GraphQLWebSocketExtra {
  readonly request: Request
  readonly signal: AbortSignal
}

export type GraphQLWebSocketHooks = Pick<
  ServerOptions<Record<string, unknown> | undefined, GraphQLWebSocketExtra>,
  'onConnect' | 'onDisconnect' | 'onClose'
>

export interface GraphQLStateInput {
  readonly request: Request
  readonly signal: AbortSignal
  readonly connectionParams?: Readonly<Record<string, unknown>> | undefined
}

export interface GraphQLRuntime<
  TContext extends object = object,
  THttpState extends object = Record<string, unknown>,
  TState extends object = {},
> {
  state?(
    input: GraphQLStateInput,
  ): TState | Response | Promise<TState | Response>
  context(
    input: GraphQLContextInput<THttpState & TState, TState>,
  ): TContext | Promise<TContext>
  readonly websocket?: GraphQLWebSocketHooks
  formatError?(
    error: GraphQLError,
    input: GraphQLContextInput<THttpState & TState, TState>,
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
