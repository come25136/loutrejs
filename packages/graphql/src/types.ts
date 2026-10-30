import type {
  BearerAuthenticator,
  HttpRawDefinition,
} from '@loutrejs/loutre/http'
import type { GraphQLManifest } from './manifest-internal.js'
import type { GraphQLError, GraphQLFormattedError } from 'graphql'

export interface GraphQLHttpContextInput<
  TIdentity extends object | undefined = object | undefined,
> {
  readonly transport: 'http'
  readonly request: Request
  readonly signal: AbortSignal
  readonly state: Readonly<Record<string, unknown>>
  readonly identity: TIdentity
}

export interface GraphQLWebSocketContextInput<
  TIdentity extends object | undefined = object | undefined,
> {
  readonly transport: 'websocket'
  readonly request: Request
  readonly connectionParams: Readonly<Record<string, unknown>> | undefined
  readonly operationId: string
  readonly signal: AbortSignal
  readonly identity: TIdentity
}

export type GraphQLContextInput<
  TIdentity extends object | undefined = object | undefined,
> = GraphQLHttpContextInput<TIdentity> | GraphQLWebSocketContextInput<TIdentity>

export interface GraphQLRuntime<
  TContext extends object = object,
  TIdentity extends object | undefined = object | undefined,
> {
  context(
    input: GraphQLContextInput<
      [TIdentity] extends [never] ? undefined : TIdentity
    >,
  ): TContext | Promise<TContext>
  authenticate?: BearerAuthenticator<TIdentity & object>
  formatError?(
    error: GraphQLError,
    input: GraphQLContextInput<
      [TIdentity] extends [never] ? undefined : TIdentity
    >,
  ): GraphQLFormattedError
  // 構造的型付けによる旧指定の紛れ込みを、公開endpointとして扱わない。
  readonly rootValue?: never
  readonly onConnectionInit?: never
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
