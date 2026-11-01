import type { GenericLayer } from '@loutrejs/loutre'
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

export interface GraphQLMiddlewareContext {
  readonly request: Request
  readonly signal: AbortSignal
  readonly connectionParams?: Readonly<Record<string, unknown>> | undefined
}

export type GraphQLMiddleware<TState extends object = any> = GenericLayer<
  GraphQLMiddlewareContext,
  TState,
  Response
>

export interface GraphQLRuntime<
  TContext extends object = object,
  THttpState extends object = Record<string, unknown>,
  TWebSocketState extends object = THttpState,
> {
  context(
    input: GraphQLContextInput<THttpState, TWebSocketState>,
  ): TContext | Promise<TContext>
  readonly websocket?: GraphQLWebSocketHooks
  formatError?(
    error: GraphQLError,
    input: GraphQLContextInput<THttpState, TWebSocketState>,
  ): GraphQLFormattedError
  // 既存のfactoryから構造的型付けで旧指定が紛れ込むことも拒否する。
  readonly rootValue?: never
}

export interface GraphQLEndpointDefinition<TContext extends object = object> {
  readonly name: string
  readonly path: string
  readonly manifest: GraphQLManifest<TContext>
  readonly schema?: never
  readonly middlewares?: readonly GraphQLMiddleware[]
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
