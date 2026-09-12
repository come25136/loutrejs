import {
  collectInjectedDependencies,
  composeLayers,
  defineExecution,
  defineExecutionExtension,
  defineLayer,
  runInInjectionContext,
  runtimeCapability,
  SchemaValidationError,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionExtensionDrainContext,
  type ExecutionKernelRuntime,
  type GenericLayer,
  type RuntimeCapabilityBinding,
  type SchemaInput,
  type SchemaOutput,
  type StandardSchemaV1,
  type Type,
} from '../core/index.js'
import {
  createCorsActualResponseHeaders,
  createCorsPreflightResponseHeaders,
} from './cors-internal.js'
import {
  assertValidHttpMethod,
  compareHttpPathSpecificity,
  createHttpDispatchKey,
  HttpPathDecodeError,
  matchHttpPath,
  parseHttpPath,
  type HttpPathSegment,
  type PathParamNames,
} from './path.js'

export interface HttpServerDriver {
  readonly runtime: string
}

export const HTTP_SERVER = runtimeCapability<HttpServerDriver>('http.server')

export interface HttpExecutionRequestDefinition {
  readonly params?: Readonly<Record<string, StandardSchemaV1>>
  readonly query?: StandardSchemaV1
  readonly headers?: StandardSchemaV1
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

type AnyHttpMiddleware = GenericLayer<any, any, HttpExecutionResult>
type HttpRouteMiddleware = AnyHttpMiddleware | HttpValidationMiddleware

export interface HttpContractBranchDefinition {
  readonly path?: string
  readonly responses?: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly middlewares?: readonly AnyHttpMiddleware[]
  readonly routes: HttpContractRouteTree
}

export type HttpContractNodeDefinition =
  | HttpExecutionRouteDefinition
  | HttpContractBranchDefinition

export type HttpContractRouteTree = Readonly<
  Record<string, HttpContractNodeDefinition>
>

declare const httpMiddlewareShortCircuit: unique symbol

export type HttpMiddleware<
  TContribution extends object = object,
  TContext extends object = HttpMiddlewareContext,
  TShortCircuit extends HttpExecutionResult = never,
> = GenericLayer<TContext, TContribution, HttpExecutionResult> & {
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
  TRoute extends HttpExecutionRouteDefinition,
  TPathPrefix extends string,
  TResponses extends Readonly<Record<string, HttpExecutionResponseDefinition>>,
  TMiddlewares extends readonly HttpRouteMiddleware[],
> = Omit<TRoute, 'path' | 'responses' | 'middlewares'> & {
  readonly path: JoinHttpPath<TPathPrefix, TRoute['path']>
  readonly responses: TResponses & TRoute['responses']
} & (readonly [
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
> = TNode extends HttpExecutionRouteDefinition
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
          HttpExecutionRouteDefinition
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
> = TNode extends HttpExecutionRouteDefinition
  ? HasResponseNameCollision<TResponses, TNode['responses']> extends true
    ? false
    : true
  : TNode extends HttpContractBranchDefinition
    ? HasResponseNameCollision<TResponses, BranchResponses<TNode>> extends true
      ? false
      : IsHttpContractTreeInheritanceValid<
          TNode['routes'],
          TResponses & BranchResponses<TNode>
        >
    : false

type IsHttpContractTreeInheritanceValid<
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

export interface HttpContract<
  TRoutes extends Readonly<Record<string, HttpExecutionRouteDefinition>> =
    Readonly<Record<string, HttpExecutionRouteDefinition>>,
> {
  readonly kind: 'http-contract'
  readonly routes: TRoutes
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

type ResponseHeadersSchema<TResponse> = TResponse extends {
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

type ResponseHeadersOutput<TResponse> =
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

type ResponseBodyOutput<TResponse extends HttpExecutionResponseDefinition> =
  TResponse extends {
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

type DeclaredHttpResults<TRoute extends HttpExecutionRouteDefinition> = {
  [TVariant in keyof TRoute['responses'] & string]: DeclaredHttpResult<
    TRoute,
    TVariant
  >
}[keyof TRoute['responses'] & string]

type ResponseHelpers<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = {
  // stringとのintersectionではproperty情報が失われるため、mapped keyはkeyof TResponsesのまま保つ。
  readonly [TVariant in keyof TResponses]: TVariant extends string
    ? TResponses[TVariant] extends infer TResponse extends
        HttpExecutionResponseDefinition
      ? (
          value: ResponseValue<TResponse>,
        ) => DeclaredHttpResponseResult<TVariant, TResponse>
      : never
    : never
}

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
  readonly response: ResponseHelpers<TRoute['responses']>
  readonly signal: AbortSignal
  readonly state: Readonly<HttpMiddlewareState<TRoute>>
}

export type HttpHandlers<TContract extends HttpContract> = {
  readonly [TName in keyof TContract['routes']]: (
    context: HttpExecutionContext<TContract['routes'][TName]>,
  ) =>
    | DeclaredHttpResults<TContract['routes'][TName]>
    | Promise<DeclaredHttpResults<TContract['routes'][TName]>>
}

export interface HttpImplementationDefinition<
  TContract extends HttpContract = HttpContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => HttpHandlers<TContract>
}

interface CompiledHttpRoute {
  readonly name: string
  readonly method: string
  readonly path: string
  readonly segments: readonly HttpPathSegment[]
  readonly dispatch: string
  readonly definition: HttpExecutionRouteDefinition
  readonly middlewares: readonly AnyHttpMiddleware[]
}

interface CompiledHttpExecution {
  readonly routes: readonly CompiledHttpRoute[]
  readonly factory: () => Record<
    string,
    (
      context: HttpExecutionContext,
    ) => HttpExecutionResult | Promise<HttpExecutionResult>
  >
}

interface RuntimeHttpRoute {
  readonly executionId: string
  readonly route: CompiledHttpRoute
}

export interface HttpExtensionRuntime {
  fetch(request: Request): Promise<Response>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
}

export interface HttpHostApi {
  fetch(request: Request): Promise<Response>
}

export const httpExecutionExtension = defineExecutionExtension<
  HttpImplementationDefinition & ExecutionDefinition,
  CompiledHttpExecution,
  'http',
  HttpHostApi,
  HttpExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: '@loutrejs/loutre/http',
  compile(definition, context) {
    const routes = Object.entries(definition.contract.routes).map(
      ([name, route]) => compileHttpRoute(name, route),
    )
    const id =
      definition.name || `${context.moduleId}.http.${context.definitionIndex}`
    const dependencies = new Set(
      collectInjectedDependencies(
        {
          kind: 'execution',
          id: `http:${id}`,
          name: id,
        },
        () => definition.factory(),
      ),
    )
    routes.forEach((route) => {
      route.middlewares.forEach((middleware, index) => {
        for (const dependency of collectInjectedDependencies(
          {
            kind: 'layer',
            id: `http:${id}:${route.name}:${index}`,
            name: middleware.name,
          },
          () => middleware.factory(),
        )) {
          dependencies.add(dependency)
        }
      })
    })
    return {
      kind: 'execution',
      id,
      executionKind: 'http.request',
      dependencies: [...dependencies],
      capabilities: [
        ...new Set([
          HTTP_SERVER,
          ...routes.flatMap((route) =>
            route.middlewares.flatMap((middleware) => middleware.capabilities),
          ),
        ]),
      ],
      compiled: Object.freeze({
        routes: Object.freeze(routes),
        factory: definition.factory as CompiledHttpExecution['factory'],
      }),
    }
  },
  validate({ executions }) {
    const dispatches = new Map<string, string>()
    return executions.flatMap((execution) =>
      execution.compiled.routes.flatMap((route) => {
        const owner = dispatches.get(route.dispatch)
        if (owner) {
          return [
            {
              code: 'LUTRE_HTTP_DUPLICATE_ROUTE',
              message: `${route.method} ${route.path} conflicts with ${owner}.`,
              path: execution.id,
            },
          ]
        }
        dispatches.set(route.dispatch, execution.id)
        return []
      }),
    )
  },
  createRuntime(context) {
    context.capabilities.get(HTTP_SERVER)
    return createHttpExtensionRuntime(
      context.executions,
      context.applicationRuntime,
    )
  },
  projectGraph: ({ execution }) => ({
    routes: execution.compiled.routes.map((route) => ({
      name: route.name,
      method: route.method,
      path: route.path,
      responses: Object.fromEntries(
        Object.entries(route.definition.responses).map(([name, response]) => [
          name,
          { status: response.status },
        ]),
      ),
    })),
  }),
  host: {
    namespace: 'http',
    create: ({ runtime }) => ({ fetch: (request) => runtime.fetch(request) }),
  },
})

export type HttpExecutionDefinition<
  TContract extends HttpContract = HttpContract,
> = HttpImplementationDefinition<TContract> &
  ExecutionDefinition<typeof httpExecutionExtension>

type HttpStatusDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type HttpStatusHundreds = '2' | '3' | '4' | '5'

type IsValidHttpResponseStatus<TStatus extends number> = number extends TStatus
  ? false
  : `${TStatus}` extends `${HttpStatusHundreds}${HttpStatusDigit}${HttpStatusDigit}`
    ? true
    : false

type IsBodylessHttpStatus<TStatus extends number> = TStatus extends
  | 204
  | 205
  | 304
  ? true
  : false

type IsResponseStatusCompatible<TResponse> =
  TResponse extends HttpExecutionResponseDefinition
    ? IsValidHttpResponseStatus<TResponse['status']> extends true
      ? IsBodylessHttpStatus<TResponse['status']> extends true
        ? TResponse extends
            | { readonly body: StandardSchemaV1 }
            | { readonly stream: 'server' }
          ? false
          : true
        : TResponse extends { readonly stream: 'server' }
          ? TResponse extends { readonly body: StandardSchemaV1 }
            ? true
            : false
          : true
      : false
    : false

type AreResponseStatusesCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseStatusCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type IsResponseHeadersSchemaCompatible<TResponse> =
  ResponseHeadersSchema<TResponse> extends infer THeaders
    ? [THeaders] extends [never]
      ? true
      : THeaders extends StandardSchemaV1
        ? SchemaOutput<THeaders> extends HttpHeaders | undefined
          ? true
          : false
        : true
    : true

type AreResponseHeadersSchemasCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseHeadersSchemaCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type ErrorMappingResult<TResponse> = TResponse extends {
  readonly error: infer TMapping extends HttpErrorMapping<any, any>
}
  ? Awaited<ReturnType<TMapping['map']>>
  : never

type IsErrorMappingCompatible<TResponse> =
  TResponse extends HttpExecutionResponseDefinition
    ? TResponse extends { readonly error: HttpErrorMapping<any, any> }
      ? TResponse extends { readonly body: StandardSchemaV1 }
        ? ErrorMappingResult<TResponse> extends HttpResponseResult<
            ResponseBodyOutput<TResponse>,
            ResponseHeadersOutput<TResponse>
          >
          ? true
          : false
        : false
      : true
    : false

type AreErrorMappingsCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsErrorMappingCompatible<TResponses[TVariant]>
}[keyof TResponses]
  ? false
  : true

type HasRequiredStringContentType<TValue> = [TValue] extends [
  { readonly 'content-type': string },
]
  ? true
  : false

type IsExactParamsSchemaMap<
  TPath extends string,
  TSchemas extends Readonly<Record<string, StandardSchemaV1>>,
> =
  Exclude<keyof TSchemas, PathParamNames<TPath>> extends never
    ? Exclude<PathParamNames<TPath>, keyof TSchemas> extends never
      ? true
      : false
    : false

type IsRawStringCompatible<TInput> = string extends TInput
  ? true
  : [Extract<TInput, string>] extends [never]
    ? false
    : true

type DoParamsSchemasAcceptStrings<
  TSchemas extends Readonly<Record<string, StandardSchemaV1>>,
> = false extends {
  [TName in keyof TSchemas]: IsRawStringCompatible<SchemaInput<TSchemas[TName]>>
}[keyof TSchemas]
  ? false
  : true

type MiddlewareShortCircuit<TMiddleware> =
  typeof httpMiddlewareShortCircuit extends keyof TMiddleware
    ? TMiddleware extends {
        readonly [httpMiddlewareShortCircuit]?: infer TResult
      }
      ? Exclude<TResult, undefined>
      : never
    : never

type RouteMiddlewareShortCircuits<TRoute extends HttpExecutionRouteDefinition> =
  TRoute extends {
    readonly middlewares: infer TMiddlewares extends
      readonly HttpRouteMiddleware[]
  }
    ? MiddlewareShortCircuit<TMiddlewares[number]>
    : never

type AreMiddlewareShortCircuitsCompatible<
  TRoute extends HttpExecutionRouteDefinition,
> = [RouteMiddlewareShortCircuits<TRoute>] extends [never]
  ? true
  : Exclude<
        RouteMiddlewareShortCircuits<TRoute>,
        DeclaredHttpResults<TRoute>
      > extends never
    ? true
    : false

type HttpRouteConstraint<TRoute extends HttpExecutionRouteDefinition> =
  (AreResponseStatusesCompatible<TRoute['responses']> extends true
    ? AreResponseHeadersSchemasCompatible<TRoute['responses']> extends true
      ? AreErrorMappingsCompatible<TRoute['responses']> extends true
        ? unknown
        : { readonly responses: never }
      : { readonly responses: never }
    : { readonly responses: never }) &
    (TRoute['request'] extends { readonly body: StandardSchemaV1 }
      ? TRoute['request'] extends {
          readonly headers: infer THeaders extends StandardSchemaV1
        }
        ? HasRequiredStringContentType<SchemaInput<THeaders>> extends true
          ? HasRequiredStringContentType<SchemaOutput<THeaders>> extends true
            ? unknown
            : { readonly request: never }
          : { readonly request: never }
        : { readonly request: never }
      : unknown) &
    (TRoute['request'] extends {
      readonly params: infer TParams extends Readonly<
        Record<string, StandardSchemaV1>
      >
    }
      ? IsExactParamsSchemaMap<TRoute['path'], TParams> extends true
        ? DoParamsSchemasAcceptStrings<TParams> extends true
          ? unknown
          : { readonly request: never }
        : { readonly request: never }
      : unknown) &
    (AreMiddlewareShortCircuitsCompatible<TRoute> extends true
      ? unknown
      : { readonly middlewares: never })

type HttpContractConstraint<
  TRoutes extends Readonly<Record<string, HttpExecutionRouteDefinition>>,
> = {
  readonly [TName in keyof TRoutes]: HttpRouteConstraint<TRoutes[TName]>
}

type ErrorOf<TDefinition> =
  TDefinition extends HttpErrorMatcher<infer TError> ? TError : never

export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
>(
  definition: TDefinition,
): HttpErrorMapping<
  ErrorOf<TDefinition>,
  { readonly body: ErrorOf<TDefinition>['data'] }
>
export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
  const TResult,
>(
  definition: TDefinition,
  map: (error: ErrorOf<TDefinition>) => TResult | Promise<TResult>,
): HttpErrorMapping<ErrorOf<TDefinition>, TResult>
export function httpError(
  definition: HttpErrorMatcher<{ readonly data: unknown }>,
  map?: (error: { readonly data: unknown }) => unknown | Promise<unknown>,
): HttpErrorMapping {
  return Object.freeze({
    kind: 'http-error-mapping',
    definition,
    map: map ?? ((error) => ({ body: error.data })),
  })
}

export function defineHttpContract<const TTree extends HttpContractRouteTree>(
  routes: TTree &
    (IsHttpContractTreeInheritanceValid<TTree> extends true ? unknown : never) &
    (ResolvedHttpContractRoutes<TTree> extends HttpContractConstraint<
      ResolvedHttpContractRoutes<TTree>
    >
      ? unknown
      : never),
): HttpContract<ResolvedHttpContractRoutes<TTree>>
export function defineHttpContract(
  routes: HttpContractRouteTree,
): HttpContract {
  const resolvedRoutes = resolveHttpContractRoutes(routes)
  for (const [name, route] of Object.entries(resolvedRoutes)) {
    compileHttpRoute(name, route)
  }
  return Object.freeze({
    kind: 'http-contract',
    routes: Object.freeze(resolvedRoutes),
  })
}

function resolveHttpContractRoutes(
  tree: HttpContractRouteTree,
): Record<string, HttpExecutionRouteDefinition> {
  const resolved: Record<string, HttpExecutionRouteDefinition> = {}

  const visit = (
    current: HttpContractRouteTree,
    pathPrefix: string,
    inheritedResponses: Readonly<
      Record<string, HttpExecutionResponseDefinition>
    >,
    inheritedMiddlewares: readonly HttpRouteMiddleware[],
  ) => {
    for (const [name, node] of Object.entries(current)) {
      if ('method' in node) {
        if ('routes' in node) {
          throw new TypeError(
            `HTTP Contract node ${name} must be either a branch or a leaf route.`,
          )
        }
        if (resolved[name]) {
          throw new TypeError(`Duplicate nested HTTP route name: ${name}`)
        }
        assertNoInheritedResponseCollision(
          name,
          inheritedResponses,
          node.responses,
        )
        resolved[name] = {
          ...node,
          path: joinHttpPath(pathPrefix, node.path),
          responses: { ...inheritedResponses, ...node.responses },
          ...(inheritedMiddlewares.length === 0 && !node.middlewares
            ? {}
            : {
                middlewares: [
                  ...inheritedMiddlewares,
                  ...(node.middlewares ?? []),
                ],
              }),
        }
        continue
      }
      if (!('routes' in node)) {
        throw new TypeError(
          `HTTP Contract node ${name} must declare method or routes.`,
        )
      }
      const branchPath = node.path ?? ''
      if (branchPath !== '') parseHttpPath(branchPath)
      assertNoInheritedResponseCollision(
        name,
        inheritedResponses,
        node.responses ?? {},
      )
      visit(
        node.routes,
        joinHttpPath(pathPrefix, branchPath),
        { ...inheritedResponses, ...node.responses },
        [...inheritedMiddlewares, ...(node.middlewares ?? [])],
      )
    }
  }

  visit(tree, '', {}, [])
  return resolved
}

function joinHttpPath(prefix: string, path: string): string {
  if (prefix === '') return path
  if (prefix === '/') return path
  if (path === '/') return prefix
  return `${prefix}${path}`
}

function assertNoInheritedResponseCollision(
  nodeName: string,
  inherited: Readonly<Record<string, HttpExecutionResponseDefinition>>,
  declared: Readonly<Record<string, HttpExecutionResponseDefinition>>,
): void {
  for (const name of Object.keys(declared)) {
    if (name in inherited) {
      throw new TypeError(
        `Duplicate inherited HTTP response ${name} at ${nodeName}.`,
      )
    }
  }
}

export function defineHttpImplementation<
  const TContract extends HttpContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: HttpImplementationDefinition<TContract>['factory']
}): HttpExecutionDefinition<TContract> {
  return defineExecution(httpExecutionExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    factory: definition.factory,
  }) as HttpExecutionDefinition<TContract>
}

export function bindHttpServer(
  driver: HttpServerDriver,
): RuntimeCapabilityBinding<HttpServerDriver> {
  return { capability: HTTP_SERVER, value: driver }
}

export function defineHttpMiddleware<
  TContribution extends object = {},
>(definition: {
  readonly name: string
  readonly state?: Type<TContribution>
  readonly factory: HttpMiddleware<NoInfer<TContribution>>['factory']
}): HttpMiddleware<TContribution> {
  return defineLayer<TContribution, HttpMiddlewareContext, HttpExecutionResult>(
    definition,
  )
}

const bodyValidation = Object.freeze({
  kind: 'http-validation' as const,
  part: 'body' as const,
}) satisfies HttpValidationMiddleware<'body'>

export const validate = Object.freeze({
  body: bodyValidation,
})

export const executionHttp = Object.freeze({
  contract: defineHttpContract,
  implementation: defineHttpImplementation,
  middleware: defineHttpMiddleware,
  validate,
  error: httpError,
  extension: httpExecutionExtension,
  serverCapability: HTTP_SERVER,
  bindServer: bindHttpServer,
})

const httpFrameworkHeaders = Symbol('loutre.http.framework-headers')

type HttpExecutionResultWithFrameworkHeaders = HttpExecutionResult & {
  readonly [httpFrameworkHeaders]?: HttpHeaders
}

export function withHttpFrameworkHeaders(
  result: HttpExecutionResult,
  headers: HttpHeaders,
): HttpExecutionResult {
  const current = (result as HttpExecutionResultWithFrameworkHeaders)[
    httpFrameworkHeaders
  ]
  return {
    ...result,
    [httpFrameworkHeaders]: { ...current, ...headers },
  } as HttpExecutionResultWithFrameworkHeaders
}

function compileHttpRoute(
  name: string,
  route: HttpExecutionRouteDefinition,
): CompiledHttpRoute {
  assertValidHttpMethod(route.method)
  const segments = parseHttpPath(route.path)
  assertValidHttpRouteDefinition(route, segments)
  const definition = snapshotHttpRouteDefinition(route)
  return Object.freeze({
    name,
    method: route.method.toUpperCase(),
    path: route.path,
    segments,
    dispatch: createHttpDispatchKey(route.method, segments),
    definition,
    middlewares: compileHttpMiddlewares(definition),
  })
}

function snapshotHttpRouteDefinition(
  route: HttpExecutionRouteDefinition,
): HttpExecutionRouteDefinition {
  const request = route.request
    ? Object.freeze({
        ...route.request,
        ...(route.request.params === undefined
          ? {}
          : { params: Object.freeze({ ...route.request.params }) }),
      })
    : undefined
  const responses = Object.freeze(
    Object.fromEntries(
      Object.entries(route.responses).map(([name, response]) => [
        name,
        Object.freeze({
          ...response,
          ...(response.headers === undefined
            ? {}
            : { headers: snapshotHttpResponseHeaders(response.headers) }),
          ...(response.error === undefined
            ? {}
            : { error: Object.freeze({ ...response.error }) }),
        }),
      ]),
    ),
  )
  return Object.freeze({
    ...route,
    ...(route.tags === undefined
      ? {}
      : { tags: Object.freeze([...route.tags]) }),
    ...(request === undefined ? {} : { request }),
    responses,
    ...(route.middlewares === undefined
      ? {}
      : { middlewares: Object.freeze([...route.middlewares]) }),
  })
}

function snapshotHttpResponseHeaders(
  headers: HttpResponseHeadersDefinition,
): HttpResponseHeadersDefinition {
  if (isStandardSchema(headers)) return headers
  if (isResponseHeadersWithDefaults(headers)) {
    return Object.freeze({
      schema: headers.schema,
      defaults: snapshotHttpHeaders(headers.defaults),
    })
  }
  return snapshotHttpHeaders(headers)
}

function snapshotHttpHeaders(headers: HttpHeaders): HttpHeaders {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ]),
    ),
  )
}

function compileHttpMiddlewares(
  route: HttpExecutionRouteDefinition,
): readonly AnyHttpMiddleware[] {
  const declared = route.middlewares ?? []
  const compiled = declared.map((middleware) =>
    isHttpValidationMiddleware(middleware)
      ? compileHttpValidationMiddleware(middleware, route)
      : middleware,
  )
  if (route.request?.body && !hasBodyValidation(declared)) {
    compiled.push(createBodyValidationMiddleware(route.request.body))
  }
  return Object.freeze(compiled)
}

function compileHttpValidationMiddleware(
  middleware: HttpValidationMiddleware,
  route: HttpExecutionRouteDefinition,
): AnyHttpMiddleware {
  switch (middleware.part) {
    case 'body': {
      const schema = route.request?.body
      if (!schema) {
        throw new TypeError(
          `HTTP ${route.method} ${route.path} uses validate.body but declares no request body.`,
        )
      }
      return createBodyValidationMiddleware(schema)
    }
  }
}

function createBodyValidationMiddleware(
  schema: StandardSchemaV1,
): AnyHttpMiddleware {
  return defineLayer<{}, HttpMiddlewareContext, HttpExecutionResult>({
    name: 'validate.body',
    factory: () => async (context, next) => {
      const rawBody = await decodeBody(
        context.request,
        validatedContentType(context.input.headers),
      )
      try {
        const body = await validateSchema(schema, rawBody)
        ;(context.input as { body: unknown }).body = body
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          throw new HttpInputValidationError(error)
        }
        throw error
      }
      await next()
    },
  })
}

function isHttpValidationMiddleware(
  middleware: HttpRouteMiddleware,
): middleware is HttpValidationMiddleware {
  return middleware.kind === 'http-validation'
}

function hasBodyValidation(
  middlewares: readonly HttpRouteMiddleware[],
): boolean {
  return middlewares.some(
    (middleware) =>
      isHttpValidationMiddleware(middleware) && middleware.part === 'body',
  )
}

function countBodyValidations(
  middlewares: readonly HttpRouteMiddleware[],
): number {
  return middlewares.filter(
    (middleware) =>
      isHttpValidationMiddleware(middleware) && middleware.part === 'body',
  ).length
}

function assertValidHttpRouteDefinition(
  route: HttpExecutionRouteDefinition,
  segments: readonly HttpPathSegment[],
): void {
  if (route.request?.body && !route.request.headers) {
    throw new TypeError(
      `HTTP ${route.method} ${route.path} declares a body but no request headers schema.`,
    )
  }
  const bodyValidationCount = countBodyValidations(route.middlewares ?? [])
  if (!route.request?.body && bodyValidationCount > 0) {
    throw new TypeError(
      `HTTP ${route.method} ${route.path} uses validate.body but declares no request body.`,
    )
  }
  if (bodyValidationCount > 1) {
    throw new TypeError(
      `HTTP ${route.method} ${route.path} declares validate.body more than once.`,
    )
  }
  if (route.request?.params) {
    const pathParams = segments
      .filter(
        (
          segment,
        ): segment is Extract<HttpPathSegment, { readonly kind: 'param' }> =>
          segment.kind === 'param',
      )
      .map((segment) => segment.name)
      .toSorted()
    const schemaParams = Object.keys(route.request.params).toSorted()
    if (
      pathParams.length !== schemaParams.length ||
      pathParams.some((name, index) => name !== schemaParams[index])
    ) {
      throw new TypeError(
        `HTTP ${route.method} ${route.path} request params must exactly match path parameters.`,
      )
    }
  }
  for (const [name, response] of Object.entries(route.responses)) {
    if (
      !Number.isInteger(response.status) ||
      response.status < 200 ||
      response.status > 599
    ) {
      throw new TypeError(
        `HTTP response ${name} has invalid status ${response.status}.`,
      )
    }
    if (
      (response.status === 204 ||
        response.status === 205 ||
        response.status === 304) &&
      (response.body || response.stream === 'server')
    ) {
      throw new TypeError(
        `HTTP response ${name} with status ${response.status} cannot declare a body or stream.`,
      )
    }
    if (response.stream === 'server' && !response.body) {
      throw new TypeError(
        `HTTP server-stream response ${name} must declare a body schema.`,
      )
    }
  }
}

function createHttpExtensionRuntime(
  executions: readonly {
    readonly id: string
    readonly compiled: CompiledHttpExecution
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): HttpExtensionRuntime {
  let accepting = true
  const activeResponseStreams = new Set<ActiveHttpResponseStream>()
  let pendingIngresses = 0
  const pendingIngressWaiters = new Set<() => void>()
  const trackPendingIngress = () => {
    pendingIngresses += 1
    let completed = false
    return () => {
      if (completed) return
      completed = true
      pendingIngresses -= 1
      if (pendingIngresses !== 0) return
      for (const resolve of pendingIngressWaiters) resolve()
      pendingIngressWaiters.clear()
    }
  }
  const waitForPendingIngresses = () =>
    pendingIngresses === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => pendingIngressWaiters.add(resolve))
  const handlers = new Map<
    string,
    ReturnType<CompiledHttpExecution['factory']>
  >()
  for (const execution of executions) {
    handlers.set(
      execution.id,
      runInInjectionContext(
        {
          consumer: {
            kind: 'execution',
            id: `http:${execution.id}`,
            name: execution.id,
          },
          resolve: (token) => applicationRuntime.resolve(token, execution.id),
        },
        () => execution.compiled.factory(),
      ),
    )
  }
  const routes = executions
    .flatMap((execution) =>
      execution.compiled.routes.map((route): RuntimeHttpRoute => ({
        executionId: execution.id,
        route,
      })),
    )
    .toSorted((left, right) =>
      compareHttpPathSpecificity(left.route.segments, right.route.segments),
    )

  return {
    async drain({ timeoutMs }) {
      accepting = false
      const deadline = Date.now() + timeoutMs
      await waitForPendingIngresses()
      const reason = new Error(
        'LUTRE_HTTP_SERVER_STREAM_DRAIN: Application is shutting down.',
      )
      const results = await Promise.allSettled(
        [...activeResponseStreams].map((stream) =>
          stream.abort(reason, deadline),
        ),
      )
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length > 0) {
        throw new AggregateError(errors, 'HTTP response stream drain failed.')
      }
    },
    async fetch(request) {
      if (!accepting) {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      const url = new URL(request.url)
      const method = request.method.toUpperCase()

      if (isCorsPreflightRequest(request)) {
        try {
          const requestedMethod = request.headers
            .get('access-control-request-method')!
            .toUpperCase()
          const match = findRuntimeHttpRoute(
            routes,
            requestedMethod,
            url.pathname,
          )
          if (match) {
            const lease = applicationRuntime.beginExecution()
            const completePendingIngress = trackPendingIngress()
            try {
              const headers = await createCorsPreflightResponseHeaders(
                match.route.middlewares,
                request,
                match.route.method,
              )
              if (headers) {
                return new Response(null, { status: 204, headers })
              }
            } finally {
              lease.complete()
              completePendingIngress()
            }
          }
        } catch (error) {
          if (error instanceof HttpPathDecodeError) {
            return Response.json({ error: 'Invalid request' }, { status: 400 })
          }
          return Response.json(
            { error: 'Internal Server Error' },
            { status: 500 },
          )
        }
      }

      let match: ReturnType<typeof findRuntimeHttpRoute>
      try {
        match = findRuntimeHttpRoute(routes, method, url.pathname)
      } catch (error) {
        if (error instanceof HttpPathDecodeError) {
          return Response.json({ error: 'Invalid request' }, { status: 400 })
        }
        return Response.json(
          { error: 'Internal Server Error' },
          { status: 500 },
        )
      }
      if (!match) {
        return Response.json({ error: 'Not Found' }, { status: 404 })
      }

      const lease = applicationRuntime.beginExecution()
      const completePendingIngress = trackPendingIngress()
      const abortRequest = () => lease.abort(request.signal.reason)
      let executionOwnedByStream = false
      let executionFinished = false
      const finishExecution = () => {
        if (executionFinished) return
        executionFinished = true
        request.signal.removeEventListener('abort', abortRequest)
        lease.complete()
      }
      const adoptResponseStream = (stream: HttpResponseStreamControl) => {
        executionOwnedByStream = true
        const activeStream: ActiveHttpResponseStream = {
          async abort(reason, deadline) {
            stream.setDrainDeadline?.(deadline)
            lease.abort(reason)
            await stream.abort(reason, deadline)
          },
        }
        activeResponseStreams.add(activeStream)
        void stream.finished.then(() => {
          activeResponseStreams.delete(activeStream)
        })
      }
      request.signal.addEventListener('abort', abortRequest, { once: true })
      if (request.signal.aborted) abortRequest()
      try {
        const corsHeaders = await createCorsActualResponseHeaders(
          match.route.middlewares,
          request,
        )
        const complete = (response: Response): Response =>
          applyFrameworkHeadersToResponse(response, corsHeaders)

        let context: HttpExecutionContext
        try {
          context = await createHttpContext(
            request,
            url,
            match.params,
            match.route,
            lease.signal,
          )
        } catch (error) {
          if (error instanceof HttpUnsupportedMediaTypeError) {
            return complete(
              Response.json(
                { error: 'Unsupported Media Type' },
                { status: 415 },
              ),
            )
          }
          if (error instanceof HttpInputDecodeError) {
            return complete(
              Response.json({ error: 'Invalid request' }, { status: 400 }),
            )
          }
          if (error instanceof SchemaValidationError) {
            return complete(
              Response.json({ error: 'Validation failed' }, { status: 400 }),
            )
          }
          throw error
        }

        const handler = handlers.get(match.executionId)?.[match.route.name]
        if (!handler) {
          throw new Error(
            `LUTRE_HTTP_HANDLER_MISSING: ${match.executionId}.${match.route.name}`,
          )
        }
        const result = await composeLayers({
          context,
          layers: match.route.middlewares,
          resolve: (token, source) => applicationRuntime.resolve(token, source),
          terminal: async (middlewareContext) =>
            handler({
              input: middlewareContext.input,
              response: middlewareContext.response,
              signal: middlewareContext.signal,
              state: middlewareContext.state,
            } as HttpExecutionContext),
        })
        const finalized = await finalizeHttpResult(
          match.route.definition,
          result,
          lease.signal,
          finishExecution,
        )
        if (finalized.streamControl)
          adoptResponseStream(finalized.streamControl)
        return complete(finalized.response)
      } catch (error) {
        if (error instanceof HttpInputDecodeError) {
          return applyFrameworkHeadersToResponse(
            Response.json({ error: 'Invalid request' }, { status: 400 }),
            await safeCorsHeaders(match.route.middlewares, request),
          )
        }
        if (error instanceof HttpInputValidationError) {
          return applyFrameworkHeadersToResponse(
            Response.json({ error: 'Validation failed' }, { status: 400 }),
            await safeCorsHeaders(match.route.middlewares, request),
          )
        }
        try {
          const mapped = await mapDeclaredError(match.route.definition, error)
          if (mapped) {
            const finalized = await finalizeHttpResult(
              match.route.definition,
              mapped,
              lease.signal,
              finishExecution,
            )
            if (finalized.streamControl) {
              adoptResponseStream(finalized.streamControl)
            }
            return applyFrameworkHeadersToResponse(
              finalized.response,
              await safeCorsHeaders(match.route.middlewares, request),
            )
          }
        } catch {
          // 内部のmapping/finalization errorをclientへ公開しない。
        }
        return applyFrameworkHeadersToResponse(
          Response.json({ error: 'Internal Server Error' }, { status: 500 }),
          await safeCorsHeaders(match.route.middlewares, request),
        )
      } finally {
        if (!executionOwnedByStream) finishExecution()
        completePendingIngress()
      }
    },
  }
}

function findRuntimeHttpRoute(
  routes: readonly RuntimeHttpRoute[],
  method: string,
  pathname: string,
):
  | (RuntimeHttpRoute & { readonly params: Record<string, string> })
  | undefined {
  for (const candidate of routes) {
    if (candidate.route.method !== method) continue
    const params = matchHttpPath(candidate.route.segments, pathname)
    if (!params) continue
    return { ...candidate, params }
  }
  return undefined
}

async function safeCorsHeaders(
  middlewares: readonly AnyHttpMiddleware[],
  request: Request,
): Promise<Headers | undefined> {
  try {
    return await createCorsActualResponseHeaders(middlewares, request)
  } catch {
    return undefined
  }
}

function isCorsPreflightRequest(request: Request): boolean {
  return (
    request.method.toUpperCase() === 'OPTIONS' &&
    request.headers.has('origin') &&
    request.headers.has('access-control-request-method')
  )
}

async function createHttpContext(
  request: Request,
  url: URL,
  rawParams: Readonly<Record<string, string>>,
  route: CompiledHttpRoute,
  signal: AbortSignal,
): Promise<HttpExecutionContext> {
  const definition = route.definition.request
  const params = definition?.params
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(definition.params).map(async ([name, schema]) => [
            name,
            await validateSchema(schema, rawParams[name]),
          ]),
        ),
      )
    : rawParams
  const rawQuery = decodeQuery(url.searchParams)
  const query = definition?.query
    ? await validateSchema(definition.query, rawQuery)
    : rawQuery
  const headers = definition?.headers
    ? await validateRequestHeaders(definition, request.headers)
    : Object.fromEntries(request.headers.entries())
  const body = definition?.body ? request.body : undefined
  const response = Object.fromEntries(
    Object.keys(route.definition.responses).map((name) => [
      name,
      (
        value: { readonly body?: unknown; readonly headers?: HttpHeaders } = {},
      ) => ({
        kind: 'http-result' as const,
        response: name,
        body: value.body,
        ...(value.headers === undefined ? {} : { headers: value.headers }),
      }),
    ]),
  )
  return {
    request,
    input: { params, query, headers, body },
    response,
    signal,
  } as unknown as HttpExecutionContext
}

function decodeQuery(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | string[]>> {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams) {
    const current = query[key]
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  }
  return query
}

async function validateRequestHeaders(
  definition: HttpExecutionRequestDefinition,
  headers: Headers,
): Promise<unknown> {
  const schema = definition.headers!
  try {
    return await validateSchema(schema, requestHeadersForValidation(headers))
  } catch (error) {
    if (
      definition.body &&
      error instanceof SchemaValidationError &&
      hasContentTypeIssue(error)
    ) {
      throw new HttpUnsupportedMediaTypeError(
        normalizeMediaType(headers.get('content-type')),
      )
    }
    throw error
  }
}

function requestHeadersForValidation(headers: Headers): Record<string, string> {
  const decoded = Object.fromEntries(headers.entries())
  const contentType = normalizeMediaType(headers.get('content-type'))
  if (contentType) decoded['content-type'] = contentType
  return decoded
}

function validatedContentType(headers: unknown): string {
  if (typeof headers !== 'object' || headers === null) {
    throw new TypeError('HTTP body requires validated request headers')
  }
  const contentType = (headers as Record<string, unknown>)['content-type']
  if (typeof contentType !== 'string' || contentType.length === 0) {
    throw new TypeError(
      'HTTP body requires request.headers content-type to resolve to a string',
    )
  }
  return contentType
}

function hasContentTypeIssue(error: SchemaValidationError): boolean {
  return error.issues.some((issue) => {
    const first = issue.path?.[0]
    const key =
      typeof first === 'object' && first !== null && 'key' in first
        ? first.key
        : first
    return key === 'content-type'
  })
}

async function decodeBody(
  request: Request,
  contentType: string,
): Promise<unknown> {
  const mediaType = normalizeMediaType(contentType)!
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    try {
      return await request.json()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  if (mediaType === 'multipart/form-data') {
    try {
      return await request.formData()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  if (mediaType.startsWith('text/')) {
    try {
      return await request.text()
    } catch (error) {
      throw new HttpInputDecodeError(error)
    }
  }
  return request.body
}

function normalizeMediaType(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized ? normalized : undefined
}

class HttpInputDecodeError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP request body decode failed', { cause })
    this.name = 'HttpInputDecodeError'
  }
}

class HttpInputValidationError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP request body validation failed', { cause })
    this.name = 'HttpInputValidationError'
  }
}

class HttpUnsupportedMediaTypeError extends Error {
  constructor(readonly mediaType: string | undefined) {
    super('HTTP request content type is unsupported by the Contract')
    this.name = 'HttpUnsupportedMediaTypeError'
  }
}

interface FinalizedHttpResult {
  readonly response: Response
  readonly streamControl?: HttpResponseStreamControl
}

interface ActiveHttpResponseStream {
  abort(reason: unknown, deadline: number): Promise<void>
}

interface HttpResponseStreamControl {
  readonly stream: ReadableStream<Uint8Array>
  readonly finished: Promise<void>
  setDrainDeadline?(deadline: number): void
  abort(reason: unknown, deadline?: number): Promise<void>
}

type ServerSentEventStreamControl = HttpResponseStreamControl

async function finalizeHttpResult(
  route: HttpExecutionRouteDefinition,
  result: HttpExecutionResult,
  signal: AbortSignal,
  completeExecution: () => void,
): Promise<FinalizedHttpResult> {
  const response = route.responses[result.response]
  if (!response) {
    throw new Error(`LUTRE_HTTP_RESPONSE_UNDECLARED: ${result.response}`)
  }
  const responseHeaders = await validateResponseHeaders(
    responseHeadersSchema(response.headers),
    result.headers,
  )
  const headers = mergeResponseHeaders(
    responseHeadersDefaults(response.headers),
    responseHeaders,
  )
  applyFrameworkResponseHeaders(
    headers,
    (result as HttpExecutionResultWithFrameworkHeaders)[httpFrameworkHeaders],
  )

  if (response.stream === 'server') {
    if (!response.body || !isAsyncIterable(result.body)) {
      throw new Error('Server-stream response requires an AsyncIterable body')
    }
    applyResponseHeaders(headers, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    })
    const serverStream = createServerSentEventStream(
      result.body,
      response.body,
      signal,
      completeExecution,
    )
    return {
      response: new Response(serverStream.stream, {
        status: response.status,
        headers,
      }),
      streamControl: serverStream,
    }
  }

  const body = response.body
    ? await validateSchema(response.body, result.body)
    : undefined
  if (body === undefined) {
    return {
      response: new Response(null, { status: response.status, headers }),
    }
  }
  if (body instanceof ReadableStream) {
    const responseStream = createLeasedReadableStream(
      body,
      signal,
      completeExecution,
    )
    return {
      response: new Response(responseStream.stream, {
        status: response.status,
        headers,
      }),
      streamControl: responseStream,
    }
  }
  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return {
      response: new Response(body as BodyInit, {
        status: response.status,
        headers,
      }),
    }
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  return {
    response: new Response(JSON.stringify(body), {
      status: response.status,
      headers,
    }),
  }
}

function createLeasedReadableStream(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  completeExecution: () => void,
): HttpResponseStreamControl {
  const reader = source.getReader()
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cleanupSettled = true
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let cleanup: Promise<void> | undefined
  let resolveFinished!: () => void
  const finishedPromise = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  const markFinished = () => {
    if (finished) return false
    finished = true
    signal.removeEventListener('abort', abort)
    return true
  }
  const completeIfSafe = () => {
    if (completed || !finished || !cleanupSettled || inFlightOperations > 0) {
      return
    }
    completed = true
    try {
      reader.releaseLock()
    } catch {
      // pending中のreader操作がsettleするまではlockを解放できない。
    }
    try {
      completeExecution()
    } finally {
      resolveFinished()
    }
  }
  const stop = (reason: unknown, errorStream: boolean): Promise<void> => {
    if (cleanup) return cleanup
    if (!markFinished()) return finishedPromise
    cleanupSettled = false
    cleanup = (async () => {
      let cleanupError: unknown
      try {
        await reader.cancel(reason)
      } catch (error) {
        cleanupError = error
      } finally {
        cleanupSettled = true
        if (errorStream) {
          controller?.error(
            cleanupError ?? reason ?? new Error('HTTP request was aborted'),
          )
        }
        completeIfSafe()
      }
      await finishedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    return cleanup
  }
  const abort = () => {
    void stop(signal.reason, true).catch(() => undefined)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    },
    async pull(value) {
      if (finished) return
      inFlightOperations += 1
      try {
        const next = await reader.read()
        if (finished) return
        if (next.done) {
          if (markFinished()) value.close()
          return
        }
        value.enqueue(next.value)
      } catch (error) {
        if (markFinished()) value.error(error)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    cancel(reason) {
      return stop(reason, false)
    },
  })
  return {
    stream,
    finished: finishedPromise,
    abort: (reason) => stop(reason, true),
  }
}

function createServerSentEventStream(
  source: AsyncIterable<unknown>,
  schema: StandardSchemaV1,
  signal: AbortSignal,
  completeExecution: () => void,
): ServerSentEventStreamControl {
  const encoder = new TextEncoder()
  const iterator = source[Symbol.asyncIterator]()
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let inFlightIteratorOperations = 0
  let iteratorDone = false
  let cleanupComplete = false
  let cleanupSettled = true
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let cleanupAttempt: Promise<void> | undefined
  let cleanupDeadline: number | undefined
  let returnContinuationPending = false
  const iteratorIdleWaiters = new Set<() => void>()
  let resolveFinished!: () => void
  const finishedPromise = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })

  const markFinished = () => {
    if (finished) return false
    finished = true
    signal.removeEventListener('abort', abort)
    return true
  }
  const completeIfSafe = () => {
    if (completed || !finished || !cleanupSettled || inFlightOperations > 0) {
      return
    }
    completed = true
    try {
      completeExecution()
    } finally {
      resolveFinished()
    }
  }
  const runIteratorOperation = async <T>(operation: () => Promise<T>) => {
    inFlightIteratorOperations += 1
    try {
      return await operation()
    } finally {
      inFlightIteratorOperations -= 1
      if (inFlightIteratorOperations === 0) {
        for (const resolve of iteratorIdleWaiters) resolve()
        iteratorIdleWaiters.clear()
      }
    }
  }
  const waitForIteratorIdle = () => {
    if (inFlightIteratorOperations === 0) return Promise.resolve()
    return new Promise<void>((resolve) => iteratorIdleWaiters.add(resolve))
  }
  const recordIteratorResult = (result: IteratorResult<unknown>) => {
    if (result.done) iteratorDone = true
    return result
  }
  const stop = (
    reason: unknown,
    errorStream: boolean,
    deadline?: number,
  ): Promise<void> => {
    if (cleanupAttempt) {
      if (deadline !== undefined) {
        cleanupDeadline = Math.min(cleanupDeadline ?? deadline, deadline)
      }
      return cleanupAttempt
    }
    if (deadline !== undefined) cleanupDeadline = deadline
    markFinished()
    if (cleanupComplete) return finishedPromise
    cleanupSettled = false
    const operation = (async () => {
      let cleanupError: unknown
      try {
        if (!returnContinuationPending) {
          if (!iterator.return) {
            iteratorDone = true
            cleanupComplete = true
            return
          }
          const result = await runIteratorOperation(async () =>
            recordIteratorResult(await iterator.return!(reason)),
          )
          returnContinuationPending = !result.done
          if (result.done) return
        }
        await waitForIteratorIdle()
        let continuationSteps = 0
        for (;;) {
          if (iteratorDone) break
          if (cleanupDeadline !== undefined && Date.now() >= cleanupDeadline) {
            throw new IteratorCleanupDeadlineError()
          }
          const result = await runIteratorOperation(async () =>
            recordIteratorResult(await iterator.next()),
          )
          if (result.done) break
          continuationSteps += 1
          if (continuationSteps % iteratorCleanupYieldInterval === 0) {
            await yieldToEventLoop()
          }
        }
      } catch (error) {
        if (error instanceof IteratorCleanupDeadlineError) throw error
        cleanupError = error
      } finally {
        if (iteratorDone || cleanupError !== undefined) {
          cleanupComplete = true
          cleanupSettled = true
          if (errorStream) {
            controller?.error(
              cleanupError ?? reason ?? new Error('HTTP request was aborted'),
            )
          }
          completeIfSafe()
        }
      }
      await finishedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    cleanupAttempt = operation
    void operation.then(
      () => {
        if (cleanupAttempt === operation) cleanupAttempt = undefined
      },
      () => {
        if (cleanupAttempt === operation) cleanupAttempt = undefined
      },
    )
    return operation
  }
  const abort = () => {
    void stop(signal.reason, true).catch(() => undefined)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    },
    async pull(value) {
      if (finished) return
      inFlightOperations += 1
      let stopPromise: Promise<void> | undefined
      try {
        const next = await runIteratorOperation(async () =>
          recordIteratorResult(await iterator.next()),
        )
        if (finished) return
        if (next.done) {
          if (markFinished()) value.close()
          return
        }
        const item = await validateSchema(schema, next.value)
        if (finished) return
        value.enqueue(encoder.encode(`data:${JSON.stringify(item)}\n\n`))
      } catch (error) {
        stopPromise = stop(error, true)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
      await stopPromise
    },
    cancel(reason) {
      return stop(reason, false)
    },
  })
  return {
    stream,
    finished: finishedPromise,
    setDrainDeadline(deadline) {
      cleanupDeadline = deadline
    },
    abort: (reason, deadline) => stop(reason, true, deadline),
  }
}

const iteratorCleanupYieldInterval = 32

class IteratorCleanupDeadlineError extends Error {
  constructor() {
    super('HTTP iterator cleanup exceeded the drain deadline.')
    this.name = 'IteratorCleanupDeadlineError'
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function mapDeclaredError(
  route: HttpExecutionRouteDefinition,
  error: unknown,
): Promise<HttpExecutionResult | undefined> {
  for (const [responseName, response] of Object.entries(route.responses)) {
    const mapping = response.error
    if (!mapping?.definition.is(error)) continue
    const mapped = await mapping.map(error)
    if (typeof mapped !== 'object' || mapped === null || !('body' in mapped)) {
      throw new Error('HTTP error mapping must return a body')
    }
    return {
      kind: 'http-result',
      response: responseName,
      body: mapped.body,
      ...('headers' in mapped
        ? { headers: mapped.headers as HttpHeaders }
        : {}),
    }
  }
  return undefined
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

async function validateResponseHeaders(
  schema: StandardSchemaV1 | undefined,
  headers: HttpHeaders | undefined,
): Promise<HttpHeaders | undefined> {
  if (!schema) {
    if (headers !== undefined) {
      throw new Error('Undeclared HTTP response header was returned')
    }
    return undefined
  }
  const validated = await validateSchema(schema, headers)
  if (validated === undefined) return undefined
  if (!isHttpHeaders(validated)) {
    throw new Error('HTTP response header schema produced an invalid value')
  }
  return validated
}

function responseHeadersSchema(
  headers: HttpResponseHeadersDefinition | undefined,
): StandardSchemaV1 | undefined {
  if (isStandardSchema(headers)) return headers
  if (isResponseHeadersWithDefaults(headers)) return headers.schema
  return undefined
}

function responseHeadersDefaults(
  headers: HttpResponseHeadersDefinition | undefined,
): HttpHeaders | undefined {
  if (headers === undefined || isStandardSchema(headers)) return undefined
  if (isResponseHeadersWithDefaults(headers)) return headers.defaults
  return headers
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === 'object' && value !== null && '~standard' in value
}

function isResponseHeadersWithDefaults(
  value: unknown,
): value is HttpResponseHeadersWithDefaults {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    isStandardSchema(value.schema)
  )
}

function isHttpHeaders(value: unknown): value is HttpHeaders {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every(
    (header) =>
      header === undefined ||
      typeof header === 'string' ||
      (Array.isArray(header) &&
        header.every((item) => typeof item === 'string')),
  )
}

function mergeResponseHeaders(
  defaults: HttpHeaders | undefined,
  dynamic: HttpHeaders | undefined,
): Headers {
  const headers = new Headers()
  applyResponseHeaders(headers, defaults)
  applyResponseHeaders(headers, dynamic)
  return headers
}

function applyResponseHeaders(
  headers: Headers,
  source: HttpHeaders | undefined,
): void {
  if (!source) return
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    headers.delete(name)
    if (typeof value === 'string') {
      headers.set(name, value)
      continue
    }
    for (const item of value) headers.append(name, item)
  }
}

function applyFrameworkHeadersToResponse(
  response: Response,
  source: Headers | undefined,
): Response {
  if (!source) return response
  const headers = new Headers(response.headers)
  applyFrameworkResponseHeaders(headers, Object.fromEntries(source.entries()))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function applyFrameworkResponseHeaders(
  headers: Headers,
  source: HttpHeaders | undefined,
): void {
  if (!source) return
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    if (name.toLowerCase() === 'vary') {
      const values = typeof value === 'string' ? [value] : value
      for (const item of values.flatMap((header) => header.split(','))) {
        appendVary(headers, item.trim())
      }
      continue
    }
    applyResponseHeaders(headers, { [name]: value })
  }
}

function appendVary(headers: Headers, value: string): void {
  if (value.length === 0) return
  const values = (headers.get('vary') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  headers.set('vary', values.join(', '))
}
