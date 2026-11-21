import { type HttpRequestHeadDefinition } from './request-head.js'
import {
  type StandardSchemaV1,
  type GenericLayer,
  type SchemaOutput,
  type ExecutionContextView,
  type LayerState,
  type ExecutionDelegation,
  type ExecutionExtensionDrainContext,
} from '../core/index.js'

export interface HttpExecutionRequestDefinition extends HttpRequestHeadDefinition {
  readonly body?: StandardSchemaV1
}

export type HttpHeaderValue = string | readonly string[]

export type HttpHeaders = Readonly<Record<string, HttpHeaderValue | undefined>>

export interface HttpErrorMatcher<TError extends { readonly data: unknown }> {
  is(error: unknown): error is TError
}

export interface HttpErrorMapping<
  TError extends { readonly data: unknown } = { readonly data: unknown },
  TResult = unknown,
> {
  readonly kind: 'http-error-mapping'
  readonly definition: HttpErrorMatcher<TError>
  readonly map: (error: TError) => TResult | Promise<TResult>
}

export interface HttpResponseHeadersWithDefaults<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly schema: TSchema
  readonly defaults: HttpHeaders
}

export type HttpResponseHeadersDefinition =
  | StandardSchemaV1
  | HttpHeaders
  | HttpResponseHeadersWithDefaults

export interface HttpExecutionResponseDefinition {
  readonly status: number
  readonly description?: string
  readonly body?: StandardSchemaV1
  readonly headers?: HttpResponseHeadersDefinition
  readonly error?: HttpErrorMapping<any, any>
  readonly stream?: 'server'
}

export type HttpValidationPart = 'body'

export interface HttpValidationMiddleware<
  TPart extends HttpValidationPart = HttpValidationPart,
> {
  readonly kind: 'http-validation'
  readonly part: TPart
}

export interface HttpExecutionRouteDefinition {
  readonly raw?: false
  readonly method: string
  readonly path: string
  readonly summary?: string
  readonly description?: string
  readonly tags?: readonly string[]
  readonly deprecated?: boolean
  readonly request?: HttpExecutionRequestDefinition
  readonly responses: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly middlewares?: readonly HttpRouteMiddleware[]
  readonly interaction?: 'unary' | 'server-stream'
}

export type HttpMiddlewareOutcome = HttpExecutionResult | Response

export type AnyHttpMiddleware = GenericLayer<any, any, HttpMiddlewareOutcome>

export type HttpRouteMiddleware = AnyHttpMiddleware | HttpValidationMiddleware

export interface HttpContractBranchDefinition {
  readonly path?: string
  readonly responses?: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly middlewares?: readonly AnyHttpMiddleware[]
  readonly routes: HttpContractRouteTree
}

export type HttpContractNodeDefinition =
  | HttpExecutionRouteDefinition
  | HttpContractRawRouteDefinition
  | HttpContractBranchDefinition

export type HttpContractRouteDefinition =
  | HttpExecutionRouteDefinition
  | HttpContractRawRouteDefinition

export interface HttpContractRawRouteDefinition {
  readonly raw: true
  readonly method: string
  readonly path: string
  readonly middlewares?: readonly AnyHttpMiddleware[]
  readonly request?: never
  readonly responses?: never
}

export const httpContractRawRouteBrand: unique symbol = Symbol.for(
  'loutre.http-contract-raw-route',
) as typeof httpContractRawRouteBrand

export interface HttpContractRawRoute extends HttpContractRawRouteDefinition {
  readonly [httpContractRawRouteBrand]: true
}

export function isHttpRawContractRoute(
  value: unknown,
): value is HttpContractRawRoute {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<HttpContractRawRoute>)[httpContractRawRouteBrand] === true
  )
}

export type HttpContractRouteTree = Readonly<
  Record<string, HttpContractNodeDefinition>
>

export declare const httpMiddlewareShortCircuit: unique symbol

export type HttpMiddleware<
  TContribution extends object = object,
  TContext extends object = HttpMiddlewareContext,
  TShortCircuit extends HttpExecutionResult = never,
> = GenericLayer<TContext, TContribution, HttpMiddlewareOutcome> & {
  readonly [httpMiddlewareShortCircuit]?: TShortCircuit
}

export interface HttpMiddlewareContext {
  readonly request: Request
  readonly input: {
    readonly params: Readonly<Record<string, unknown>>
    readonly query: unknown
    readonly headers: unknown
    readonly body: unknown
  }
  readonly signal: AbortSignal
}

type MiddlewareContribution<TMiddleware> =
  TMiddleware extends GenericLayer<any, infer TContribution, any>
    ? TContribution
    : {}

type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

type JoinHttpPath<
  TPrefix extends string,
  TPath extends string,
> = TPrefix extends ''
  ? TPath
  : TPrefix extends '/'
    ? TPath
    : TPath extends '/'
      ? TPrefix
      : `${TPrefix}${TPath}`

type BranchPath<TBranch extends HttpContractBranchDefinition> =
  TBranch extends { readonly path: infer TPath extends string } ? TPath : ''

type BranchResponses<TBranch extends HttpContractBranchDefinition> =
  TBranch extends {
    readonly responses: infer TResponses extends Readonly<
      Record<string, HttpExecutionResponseDefinition>
    >
  }
    ? TResponses
    : {}

type BranchMiddlewares<TBranch extends HttpContractBranchDefinition> =
  TBranch extends {
    readonly middlewares: infer TMiddlewares extends
      readonly AnyHttpMiddleware[]
  }
    ? TMiddlewares
    : readonly []

type ResolveHttpRoute<
  TRoute extends HttpContractRouteDefinition,
  TPathPrefix extends string,
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
  TMiddlewares extends readonly HttpRouteMiddleware[],
> = Omit<TRoute, 'path' | 'responses' | 'middlewares'> & {
  readonly path: JoinHttpPath<TPathPrefix, TRoute['path']>
} & (TRoute extends HttpContractRawRouteDefinition
    ? Omit<HttpContractRawRoute, keyof HttpContractRawRouteDefinition>
    : { readonly responses: TResponses & TRoute['responses'] }) &
  (readonly [
    ...TMiddlewares,
    ...(TRoute extends {
      readonly middlewares: infer TRouteMiddlewares extends
        readonly HttpRouteMiddleware[]
    }
      ? TRouteMiddlewares
      : readonly []),
  ] extends readonly []
    ? {}
    : {
        readonly middlewares: readonly [
          ...TMiddlewares,
          ...(TRoute extends {
            readonly middlewares: infer TRouteMiddlewares extends
              readonly HttpRouteMiddleware[]
          }
            ? TRouteMiddlewares
            : readonly []),
        ]
      })

type ResolveHttpNode<
  TName extends string,
  TNode extends HttpContractNodeDefinition,
  TPathPrefix extends string,
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
  TMiddlewares extends readonly HttpRouteMiddleware[],
> = TNode extends HttpContractRouteDefinition
  ? Readonly<
      Record<
        TName,
        ResolveHttpRoute<TNode, TPathPrefix, TResponses, TMiddlewares>
      >
    >
  : TNode extends HttpContractBranchDefinition
    ? ResolveHttpRouteTree<
        TNode['routes'],
        JoinHttpPath<TPathPrefix, BranchPath<TNode>>,
        TResponses & BranchResponses<TNode>,
        readonly [...TMiddlewares, ...BranchMiddlewares<TNode>]
      >
    : never

type ResolveHttpRouteTree<
  TTree extends HttpContractRouteTree,
  TPathPrefix extends string = '',
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>> =
    {},
  TMiddlewares extends readonly HttpRouteMiddleware[] = readonly [],
> = UnionToIntersection<
  {
    [TName in keyof TTree & string]: ResolveHttpNode<
      TName,
      TTree[TName],
      TPathPrefix,
      TResponses,
      TMiddlewares
    >
  }[keyof TTree & string]
>

export type ResolvedHttpContractRoutes<TTree extends HttpContractRouteTree> =
  ResolveHttpRouteTree<TTree> extends infer TRoutes
    ? {
        readonly [TName in keyof TRoutes]: Extract<
          TRoutes[TName],
          HttpContractRouteDefinition
        >
      }
    : never

type HasResponseNameCollision<
  TLeft extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
  TRight extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
> = Extract<keyof TLeft, keyof TRight> extends never ? false : true

type IsHttpContractNodeInheritanceValid<
  TNode extends HttpContractNodeDefinition,
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
> = TNode extends HttpContractRawRouteDefinition
  ? keyof TResponses extends never
    ? true
    : false
  : TNode extends HttpExecutionRouteDefinition
    ? HasResponseNameCollision<TResponses, TNode['responses']> extends true
      ? false
      : true
    : TNode extends HttpContractBranchDefinition
      ? HasResponseNameCollision<
          TResponses,
          BranchResponses<TNode>
        > extends true
        ? false
        : IsHttpContractTreeInheritanceValid<
            TNode['routes'],
            TResponses & BranchResponses<TNode>
          >
      : false

export type IsHttpContractTreeInheritanceValid<
  TTree extends HttpContractRouteTree,
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>> =
    {},
> = string extends keyof TTree
  ? true
  : false extends {
        [TName in keyof TTree]: IsHttpContractNodeInheritanceValid<
          TTree[TName],
          TResponses
        >
      }[keyof TTree]
    ? false
    : true

type HttpMiddlewareState<TRoute extends HttpExecutionRouteDefinition> =
  TRoute extends {
    readonly middlewares: infer TMiddlewares extends
      readonly HttpRouteMiddleware[]
  }
    ? UnionToIntersection<MiddlewareContribution<TMiddlewares[number]>>
    : {}

export const httpContractBrand: unique symbol = Symbol.for(
  'loutre.http-contract',
) as typeof httpContractBrand

declare const httpResponseOwner: unique symbol
type HttpResponseReference<TRoutes, TName, TVariant, TResponse> = TResponse & {
  readonly [httpResponseOwner]: readonly [
    (routes: TRoutes) => TRoutes,
    TName,
    TVariant,
  ]
}

type HttpResponseReferences<
  TRoutes extends Readonly<Record<string, HttpContractRouteDefinition>>,
> = {
  readonly [
    TName in keyof TRoutes as TRoutes[TName] extends HttpContractRawRouteDefinition
      ? never
      : TName
  ]: {
    readonly [
      TVariant in keyof TRoutes[TName]['responses']
    ]: HttpResponseReference<
      TRoutes,
      TName,
      TVariant,
      TRoutes[TName]['responses'][TVariant]
    >
  }
}

export type HttpContract<
  TRoutes extends Readonly<Record<string, HttpContractRouteDefinition>> =
    Readonly<Record<string, HttpContractRouteDefinition>>,
> = {
  readonly kind: 'http-contract'
  readonly routes: TRoutes
  readonly [httpContractBrand]: true
} & (string extends keyof TRoutes ? {} : HttpResponseReferences<TRoutes>)

export function isHttpContract(value: unknown): value is HttpContract {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<HttpContract>
  return (
    candidate.kind === 'http-contract' &&
    candidate[httpContractBrand] === true &&
    typeof candidate.routes === 'object' &&
    candidate.routes !== null
  )
}

type RequestValue<
  TRequest extends HttpExecutionRequestDefinition | undefined,
  TPart extends keyof HttpExecutionRequestDefinition,
  TFallback,
> = TRequest extends HttpExecutionRequestDefinition
  ? TRequest[TPart] extends StandardSchemaV1
    ? SchemaOutput<TRequest[TPart]>
    : TFallback
  : TFallback

type RawHttpQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>

type RawHttpRequestHeaders = Readonly<Record<string, string | undefined>>

type HttpParamsValue<
  TRequest extends HttpExecutionRequestDefinition | undefined,
> = TRequest extends { readonly params: infer TParams }
  ? TParams extends Readonly<Record<string, StandardSchemaV1>>
    ? { readonly [K in keyof TParams]: SchemaOutput<TParams[K]> }
    : Readonly<Record<string, string>>
  : Readonly<Record<string, string>>

type IsAny<T> = 0 extends 1 & T ? true : false

type IsUnknown<T> = unknown extends T
  ? [keyof T] extends [never]
    ? true
    : false
  : false

export type ResponseHeadersSchema<TResponse> = TResponse extends {
  readonly headers: infer THeaders
}
  ? THeaders extends StandardSchemaV1
    ? THeaders
    : THeaders extends {
          readonly schema: infer TSchema extends StandardSchemaV1
        }
      ? TSchema
      : never
  : never

export type ResponseHeadersOutput<TResponse> =
  ResponseHeadersSchema<TResponse> extends infer TSchema
    ? [TSchema] extends [never]
      ? never
      : TSchema extends StandardSchemaV1
        ? SchemaOutput<TSchema>
        : never
    : never

type HttpResultHeaders<THeaders> =
  IsAny<THeaders> extends true
    ? { readonly headers?: HttpHeaders }
    : IsUnknown<THeaders> extends true
      ? { readonly headers?: HttpHeaders }
      : [THeaders] extends [never]
        ? { readonly headers?: never }
        : undefined extends THeaders
          ? { readonly headers?: Exclude<THeaders, undefined> }
          : { readonly headers: THeaders }

export type HttpExecutionResult<
  TVariant extends string = string,
  TBody = unknown,
  THeaders = unknown,
> = {
  readonly kind: 'http-result'
  readonly response: TVariant
  readonly body: TBody
} & HttpResultHeaders<THeaders>

export type HttpResponseResult<TBody, THeaders = unknown> = {
  readonly body: TBody
} & HttpResultHeaders<THeaders>

export type ResponseBodyOutput<
  TResponse extends HttpExecutionResponseDefinition,
> = TResponse extends {
  readonly stream: 'server'
  readonly body: infer TBody extends StandardSchemaV1
}
  ? AsyncIterable<SchemaOutput<TBody>>
  : TResponse['body'] extends StandardSchemaV1
    ? SchemaOutput<TResponse['body']>
    : undefined

type ResponseValue<TResponse extends HttpExecutionResponseDefinition> =
  (TResponse['body'] extends StandardSchemaV1
    ? { readonly body: ResponseBodyOutput<TResponse> }
    : { readonly body?: undefined }) &
    HttpResultHeaders<ResponseHeadersOutput<TResponse>>

type DeclaredHttpResponseResult<
  TVariant extends string,
  TResponse extends HttpExecutionResponseDefinition,
> = HttpExecutionResult<
  TVariant,
  ResponseBodyOutput<TResponse>,
  ResponseHeadersOutput<TResponse>
>

type DeclaredHttpResult<
  TRoute extends HttpExecutionRouteDefinition,
  TVariant extends keyof TRoute['responses'] & string,
> = DeclaredHttpResponseResult<TVariant, TRoute['responses'][TVariant]>

export type DeclaredHttpResults<TRoute extends HttpExecutionRouteDefinition> = {
  [TVariant in keyof TRoute['responses'] & string]: DeclaredHttpResult<
    TRoute,
    TVariant
  >
}[keyof TRoute['responses'] & string]

type HandlerResult<
  TRoutes extends HttpContract['routes'],
  TName extends keyof TRoutes,
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = {
  [K in keyof TResponses]: TResponses[K] extends {
    readonly error: HttpExecutionResponseDefinition['error']
  }
    ? never
    : {
        readonly schema: HttpResponseReference<TRoutes, TName, K, TResponses[K]>
      } & ResponseValue<TResponses[K]>
}[keyof TResponses]

export type HttpExecutionContext<
  TRoute extends HttpExecutionRouteDefinition = HttpExecutionRouteDefinition,
> = {
  readonly input: {
    readonly params: HttpParamsValue<TRoute['request']>
    readonly query: RequestValue<TRoute['request'], 'query', RawHttpQuery>
    readonly headers: RequestValue<
      TRoute['request'],
      'headers',
      RawHttpRequestHeaders
    >
    readonly body: RequestValue<TRoute['request'], 'body', undefined>
  }
  readonly signal: AbortSignal
  readonly state: Readonly<HttpMiddlewareState<TRoute>>
}

export type HttpHandlers<TContract extends HttpContract> = {
  readonly [
    TName in keyof TContract['routes'] as TContract['routes'][TName] extends HttpContractRawRouteDefinition
      ? never
      : TName
  ]: (
    context: HttpExecutionContext<
      Extract<TContract['routes'][TName], HttpExecutionRouteDefinition>
    >,
  ) =>
    | HandlerResult<
        TContract['routes'],
        TName,
        Extract<
          TContract['routes'][TName],
          HttpExecutionRouteDefinition
        >['responses']
      >
    | Promise<
        HandlerResult<
          TContract['routes'],
          TName,
          Extract<
            TContract['routes'][TName],
            HttpExecutionRouteDefinition
          >['responses']
        >
      >
}

export interface HttpImplementationDefinition<
  TContract extends HttpContract = HttpContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => HttpHandlers<TContract>
}

export interface HttpRawRouteDefinition {
  readonly method: string
  readonly path: string
  readonly middlewares?: readonly AnyHttpMiddleware[]
  readonly protocol?: string
}

export interface HttpRawExecutionContext<
  TState = Readonly<Record<string, unknown>>,
> {
  readonly request: Request
  readonly signal: AbortSignal
  readonly state: Readonly<TState>
  readonly execution: ExecutionContextView
}

type RawMiddlewareState<TMiddlewares extends readonly AnyHttpMiddleware[]> =
  LayerState<TMiddlewares>

export interface HttpRawDefinition<
  TMiddlewares extends readonly AnyHttpMiddleware[] =
    readonly AnyHttpMiddleware[],
> {
  readonly name?: string
  readonly route: HttpRawRouteDefinition & {
    readonly middlewares?: TMiddlewares
  }
  readonly factory: () => (
    context: HttpRawExecutionContext<RawMiddlewareState<TMiddlewares>>,
  ) => Response | Promise<Response>
}

export interface HttpRawDelegatedDefinition<
  TMiddlewares extends readonly AnyHttpMiddleware[] =
    readonly AnyHttpMiddleware[],
> {
  readonly name?: string
  readonly route: HttpRawRouteDefinition & {
    readonly middlewares?: TMiddlewares
  }
  readonly delegate: ExecutionDelegation<
    (
      context: HttpRawExecutionContext<RawMiddlewareState<TMiddlewares>>,
    ) => Response | Promise<Response>
  >
}

export interface HttpExtensionRuntime {
  fetch(request: Request): Promise<Response>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
}

export interface HttpHostApi {
  fetch(request: Request): Promise<Response>
}
