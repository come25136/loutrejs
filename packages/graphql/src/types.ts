import type { ConnectionRejected } from './connection-rejected.js'
import type { ServerOptions } from 'graphql-ws'
import type { HttpContractRawRoute } from '@loutrejs/loutre/http'
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

export interface GraphQLWebSocketExtra<
  TState extends object = Record<string, unknown>,
> {
  readonly state: Readonly<TState> | undefined
  readonly request: Request
  readonly signal: AbortSignal
}

export type GraphQLWebSocketHooks<
  TState extends object = Record<string, unknown>,
  THandshakeState extends object = Record<string, unknown>,
> = Pick<
  ServerOptions<
    Record<string, unknown> | undefined,
    GraphQLWebSocketExtra<NoInfer<TState>>
  >,
  'onDisconnect' | 'onClose'
> & {
  readonly connectionInit?: GraphQLConnectionInitHandler<
    TState,
    THandshakeState
  >
}

export interface GraphQLConnectionInitContext<
  TState extends object = Record<string, unknown>,
> {
  readonly state: Readonly<TState>
  readonly request: Request
  readonly signal: AbortSignal
  readonly payload: Readonly<Record<string, unknown>> | undefined
}

type ConnectionState<TState extends object> = TState & {
  readonly then?: never
} & (TState extends
    | Response
    | ConnectionRejected
    | PromiseLike<unknown>
    | readonly unknown[]
    | ((...args: never[]) => unknown)
    ? never
    : unknown)

export type GraphQLConnectionInitHandler<
  TState extends object = Record<string, unknown>,
  THandshakeState extends object = Record<string, unknown>,
> = (
  input: GraphQLConnectionInitContext<THandshakeState>,
) =>
  | ConnectionRejected
  | ConnectionState<TState>
  | Promise<ConnectionRejected | ConnectionState<TState>>

export interface GraphQLRuntime<
  TContext extends object = object,
  TInput extends GraphQLContextInput<object, object> = GraphQLContextInput,
  TState extends object = Record<string, unknown>,
  THandshakeState extends object = Record<string, unknown>,
> {
  context(input: TInput): TContext | Promise<TContext>
  readonly ws?: GraphQLWebSocketHooks<TState, THandshakeState>
  formatError?(error: GraphQLError, input: TInput): GraphQLFormattedError
  // 既存のfactoryから構造的型付けで旧指定が紛れ込むことも拒否する。
  readonly rootValue?: never
}

export interface GraphQLImplementationDefinition<
  TContext extends object = object,
> {
  readonly name: string
  readonly route: HttpContractRawRoute
  readonly path?: never
  readonly manifest: GraphQLManifest<TContext>
  readonly schema?: never
  readonly transports?: {
    readonly http?: boolean
    readonly websocket?:
      | boolean
      | {
          readonly connectionInitWaitTimeout?: number
        }
  }
  readonly factory: () => GraphQLRuntime<TContext>
}
