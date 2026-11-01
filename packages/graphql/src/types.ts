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

export interface GraphQLConnectionInitContext {
  readonly request: Request
  readonly signal: AbortSignal
  readonly payload: Readonly<Record<string, unknown>> | undefined
}

export interface GraphQLConnectionInitNext {
  (): Promise<Readonly<{}>>
  <TState extends object>(state: TState): Promise<Readonly<TState>>
}

export type GraphQLConnectionInitHandler<TState extends object = object> = (
  input: GraphQLConnectionInitContext,
  next: GraphQLConnectionInitNext,
) => void | Response | TState | Promise<void | Response | TState>

export interface GraphQLRuntime<
  TContext extends object = object,
  TInput extends GraphQLContextInput<object, object> = GraphQLContextInput,
  TState extends object = object,
> {
  context(input: TInput): TContext | Promise<TContext>
  readonly ws?: GraphQLWebSocketHooks & {
    readonly connectionInit?: GraphQLConnectionInitHandler<TState>
  }
  formatError?(error: GraphQLError, input: TInput): GraphQLFormattedError
  // 既存のfactoryから構造的型付けで旧指定が紛れ込むことも拒否する。
  readonly rootValue?: never
}

export interface GraphQLEndpointDefinition<TContext extends object = object> {
  readonly name: string
  readonly path: string
  readonly manifest: GraphQLManifest<TContext>
  readonly schema?: never
  readonly http?:
    | boolean
    | { readonly middlewares?: HttpRawDefinition['route']['middlewares'] }
  readonly ws?:
    | boolean
    | {
        readonly connectionInitWaitTimeout?: number
      }
  readonly factory: () => GraphQLRuntime<TContext>
}
