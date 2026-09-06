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
  type ApplicationModel,
  type ExecutionDefinition,
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
  readonly body?: StandardSchemaV1
  readonly headers?: HttpResponseHeadersDefinition
}

export interface HttpExecutionRouteDefinition {
  readonly method: string
  readonly path: string
  readonly request?: HttpExecutionRequestDefinition
  readonly responses: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly middlewares?: readonly AnyHttpMiddleware[]
}

type AnyHttpMiddleware = GenericLayer<any, any, HttpExecutionResult>
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

type HttpMiddlewareState<TRoute extends HttpExecutionRouteDefinition> =
  TRoute extends {
    readonly middlewares: infer TMiddlewares extends
      readonly AnyHttpMiddleware[]
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

type ResponseValue<TResponse extends HttpExecutionResponseDefinition> =
  (TResponse['body'] extends StandardSchemaV1
    ? { readonly body: SchemaOutput<TResponse['body']> }
    : { readonly body?: undefined }) &
    HttpResultHeaders<ResponseHeadersOutput<TResponse>>

type DeclaredHttpResponseResult<
  TVariant extends string,
  TResponse extends HttpExecutionResponseDefinition,
> = HttpExecutionResult<
  TVariant,
  TResponse['body'] extends StandardSchemaV1
    ? SchemaOutput<TResponse['body']>
    : undefined,
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
  // Keep the mapped key as `keyof TResponses`: intersecting it with `string`
  // makes TypeScript lose the source property used by go-to-definition.
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
    readonly query: RequestValue<TRoute['request'], 'query', URLSearchParams>
    readonly headers: RequestValue<TRoute['request'], 'headers', Headers>
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
  drain(): void
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
          kind: 'implementation-consumer',
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
            kind: 'layer-consumer',
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
      extension: definition.extension,
      dependencies: [...dependencies],
      capabilities: [
        ...new Set([
          HTTP_SERVER,
          ...routes.flatMap((route) =>
            route.middlewares.flatMap((middleware) => middleware.capabilities),
          ),
        ]),
      ],
      compiled: {
        routes,
        factory: definition.factory as CompiledHttpExecution['factory'],
      },
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
  project: ({ execution }) => ({
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
        ? TResponse extends { readonly body: StandardSchemaV1 }
          ? false
          : true
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
      readonly AnyHttpMiddleware[]
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
      ? unknown
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

export function defineHttpContract<
  const TRoutes extends Readonly<Record<string, HttpExecutionRouteDefinition>>,
>(routes: TRoutes & HttpContractConstraint<TRoutes>): HttpContract<TRoutes> {
  for (const [name, route] of Object.entries(routes)) {
    compileHttpRoute(name, route)
  }
  return Object.freeze({ kind: 'http-contract', routes })
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

export function collectHttpRoutes(model: ApplicationModel) {
  return model.executions
    .filter(
      (execution) => execution.extension.name === httpExecutionExtension.name,
    )
    .flatMap((execution) =>
      (execution.compiled as CompiledHttpExecution).routes.map((route) => ({
        procedure: route.name,
        definition: {
          ...route.definition,
          method: route.method,
          path: route.path,
        },
      })),
    )
}

export const executionHttp = Object.freeze({
  contract: defineHttpContract,
  implementation: defineHttpImplementation,
  middleware: defineHttpMiddleware,
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
  return Object.freeze({
    name,
    method: route.method.toUpperCase(),
    path: route.path,
    segments,
    dispatch: createHttpDispatchKey(route.method, segments),
    definition: route,
    middlewares: route.middlewares ?? [],
  })
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
      response.body
    ) {
      throw new TypeError(
        `HTTP response ${name} with status ${response.status} cannot declare a body.`,
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
            kind: 'implementation-consumer',
            id: `http:${execution.id}`,
            name: execution.id,
          },
          resolve: (token) => applicationRuntime.resolve(token),
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
    drain() {
      accepting = false
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
      const abortRequest = () => lease.abort(request.signal.reason)
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
          resolve: (token) => applicationRuntime.resolve(token),
          terminal: async (middlewareContext) =>
            handler({
              input: middlewareContext.input,
              response: middlewareContext.response,
              signal: middlewareContext.signal,
              state: middlewareContext.state,
            } as HttpExecutionContext),
        })
        return complete(
          await finalizeHttpResult(match.route.definition, result),
        )
      } catch {
        return applyFrameworkHeadersToResponse(
          Response.json({ error: 'Internal Server Error' }, { status: 500 }),
          await safeCorsHeaders(match.route.middlewares, request),
        )
      } finally {
        request.signal.removeEventListener('abort', abortRequest)
        lease.complete()
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
    : url.searchParams
  const headers = definition?.headers
    ? await validateRequestHeaders(definition, request.headers)
    : request.headers
  const rawBody = definition?.body
    ? await decodeBody(request, validatedContentType(headers))
    : undefined
  const body = definition?.body
    ? await validateSchema(definition.body, rawBody)
    : undefined
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

class HttpUnsupportedMediaTypeError extends Error {
  constructor(readonly mediaType: string | undefined) {
    super('HTTP request content type is unsupported by the Contract')
    this.name = 'HttpUnsupportedMediaTypeError'
  }
}

async function finalizeHttpResult(
  route: HttpExecutionRouteDefinition,
  result: HttpExecutionResult,
): Promise<Response> {
  const response = route.responses[result.response]
  if (!response) {
    throw new Error(`LUTRE_HTTP_RESPONSE_UNDECLARED: ${result.response}`)
  }
  const body = response.body
    ? await validateSchema(response.body, result.body)
    : undefined
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
  if (body === undefined) {
    return new Response(null, { status: response.status, headers })
  }
  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return new Response(body as BodyInit, { status: response.status, headers })
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  return new Response(JSON.stringify(body), {
    status: response.status,
    headers,
  })
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
