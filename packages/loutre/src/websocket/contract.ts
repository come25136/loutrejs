import {
  type WebSocketSessionId,
  type NegotiatedSubprotocol,
} from './identity.js'
import {
  type StandardSchemaV1,
  type SchemaOutput,
  type LayerState,
  type ExecutionContextView,
  type ExecutionDelegation,
  type ExecutionExtensionDrainContext,
} from '../core/index.js'
import { type HttpRequestHeadDefinition } from '../http/request-head.js'
import { type HttpRawRouteDefinition } from '../http/contract.js'
import { type Descriptor } from '../internal/brand.js'

export type WebSocketDataMessage =
  | { readonly kind: 'text'; readonly data: string }
  | { readonly kind: 'binary'; readonly data: Uint8Array }

export interface WebSocketCloseInfo {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
}

export interface WebSocketConnectionDriver {
  readonly protocol: string
  readonly messages: AsyncIterable<WebSocketDataMessage>
  readonly closed: Promise<WebSocketCloseInfo>
  send(message: WebSocketDataMessage): Promise<void>
  close(code?: number, reason?: string): Promise<void>
  terminate(): void | Promise<void>
}

export interface WebSocketUpgradeResult {
  readonly response: Response
  readonly connection: WebSocketConnectionDriver
}

export interface WebSocketUpgradeOptions {
  readonly protocol?: string
}

export interface WebSocketSession {
  readonly id: WebSocketSessionId
  readonly protocol: NegotiatedSubprotocol
}

export interface WebSocketServerDriver {
  readonly runtime: string
  upgrade(
    request: Request,
    options: WebSocketUpgradeOptions,
  ): Promise<WebSocketUpgradeResult>
}

export type WebSocketCodecKind = 'json' | 'text' | 'binary'

export interface WebSocketMessageCodec<
  TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
  TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  readonly kind: WebSocketCodecKind
  readonly input: TInput
  readonly output: TOutput
}

export type WebSocketIncomingMessage<TValue> =
  | { readonly kind: 'valid'; readonly value: TValue }
  | {
      readonly kind: 'invalid'
      readonly raw: unknown
      readonly error: Error
    }

export interface WebSocketBranchDefinition {
  readonly path?: string
  readonly routes: WebSocketRouteTree
}

export interface WebSocketHandshakeDefinition extends HttpRequestHeadDefinition {
  readonly protocols?: readonly string[]
  readonly middlewares?: HttpRawRouteDefinition['middlewares']
}

export interface WebSocketRouteDefinition {
  readonly path: string
  readonly handshake?: WebSocketHandshakeDefinition
  readonly messages?: WebSocketMessageCodec
}

export type WebSocketRouteTree = Readonly<
  Record<string, WebSocketRouteDefinition | WebSocketBranchDefinition>
>

export interface WebSocketContract<
  TRoutes extends WebSocketRouteTree = WebSocketRouteTree,
> extends Descriptor<'websocket-contract'> {
  readonly kind: 'websocket-contract'
  readonly routes: TRoutes
}

type IncomingApi<TRoute extends WebSocketRouteDefinition> =
  TRoute['messages'] extends WebSocketMessageCodec<infer TInput, any>
    ? TInput extends StandardSchemaV1
      ? {
          readonly messages: AsyncIterable<
            WebSocketIncomingMessage<SchemaOutput<TInput>>
          >
        }
      : {}
    : {}

type SendApi<TRoute extends WebSocketRouteDefinition> =
  TRoute['messages'] extends WebSocketMessageCodec<any, infer TOutput>
    ? TOutput extends StandardSchemaV1
      ? { send(value: SchemaOutput<TOutput>): Promise<void> }
      : {}
    : {}

type OpeningRequestInput<TRoute extends WebSocketRouteDefinition> = {
  readonly params: TRoute extends {
    readonly handshake: {
      readonly params: infer TParams extends Readonly<
        Record<string, StandardSchemaV1>
      >
    }
  }
    ? { readonly [TName in keyof TParams]: SchemaOutput<TParams[TName]> }
    : Readonly<Record<string, string>>
  readonly query: TRoute extends {
    readonly handshake: {
      readonly query: infer TQuery extends StandardSchemaV1
    }
  }
    ? SchemaOutput<TQuery>
    : Readonly<Record<string, string | string[]>>
  readonly headers: TRoute extends {
    readonly handshake: {
      readonly headers: infer THeaders extends StandardSchemaV1
    }
  }
    ? SchemaOutput<THeaders>
    : Headers
}

export type WebSocketHandlerContext<
  TRoute extends WebSocketRouteDefinition = WebSocketRouteDefinition,
> = {
  readonly request: Request
  readonly state: Readonly<
    TRoute extends {
      readonly handshake: {
        readonly middlewares: infer TLayers extends NonNullable<
          WebSocketHandshakeDefinition['middlewares']
        >
      }
    }
      ? LayerState<TLayers>
      : {}
  >
  readonly session: WebSocketSession
  readonly protocol: string
  readonly execution: ExecutionContextView
  readonly input: OpeningRequestInput<TRoute> & IncomingApi<TRoute>
  readonly signal: AbortSignal
  readonly closed: Promise<WebSocketCloseInfo>
  close(code?: number, reason?: string): Promise<void>
} & SendApi<TRoute>

type UnionToIntersection<TValue> = (
  TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

// route名が未確定のContractを再帰展開すると型が収束しないため、具体的なtreeだけを展開する。
type WebSocketHandlersForTree<
  TTree extends WebSocketRouteTree,
  TPrefix extends string = '',
> = string extends keyof TTree
  ? Readonly<
      Record<
        string,
        (
          context: WebSocketHandlerContext<WebSocketRouteDefinition>,
        ) => void | Promise<void>
      >
    >
  : UnionToIntersection<
      {
        readonly [
          TName in keyof TTree & string
        ]: TTree[TName] extends WebSocketBranchDefinition
          ? WebSocketHandlersForTree<
              TTree[TName]['routes'],
              `${TPrefix}${TName}.`
            >
          : TTree[TName] extends WebSocketRouteDefinition
            ? {
                readonly [THandlerName in `${TPrefix}${TName}`]: (
                  context: WebSocketHandlerContext<TTree[TName]>,
                ) => void | Promise<void>
              }
            : never
      }[keyof TTree & string]
    >

export type WebSocketHandlers<TContract extends WebSocketContract> =
  WebSocketHandlersForTree<TContract['routes']>

export interface WebSocketImplementationDefinition<
  TContract extends WebSocketContract = WebSocketContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => WebSocketHandlers<TContract>
}

export interface WebSocketDelegatedDefinition<
  TContract extends WebSocketContract = WebSocketContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly delegate: ExecutionDelegation<NoInfer<WebSocketHandlers<TContract>>>
}

export interface WebSocketExtensionRuntime {
  upgrade(request: Request): Promise<Response>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
  close(): void
}

export interface WebSocketHostApi {
  upgrade(request: Request): Promise<Response>
}
