import {
  defineExecution,
  defineLayer,
  defineExecutionExtension,
  composeLayers,
  runtimeCapability,
  runInInjectionContext,
  SchemaValidationError,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type GenericLayer,
  type RuntimeCapabilityBinding,
  type SchemaOutput,
  type StandardSchemaV1,
  type TokenLike,
  type TokenValue,
  type Type,
  type ApplicationModel,
} from '@loutrejs/loutre'
import {
  assertValidHttpMethod,
  createHttpDispatchKey,
  matchHttpPath,
  parseHttpPath,
  type HttpPathSegment,
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

type AnyHttpMiddleware = GenericLayer<any, any, HttpExecutionResult, any>

export type HttpMiddleware<
  TContribution extends object = object,
  TInject extends readonly TokenLike[] = readonly TokenLike[],
  TContext extends object = HttpMiddlewareContext,
> = GenericLayer<TContext, TContribution, HttpExecutionResult, TInject>

export interface HttpMiddlewareContext {
  readonly request: Request
  readonly params: Readonly<Record<string, unknown>>
  readonly query: unknown
  readonly headers: unknown
  readonly body: unknown
  readonly signal: AbortSignal
}

type MiddlewareContribution<TMiddleware> =
  TMiddleware extends GenericLayer<any, infer TContribution, any, any>
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

type DeclaredHttpResult<
  TRoute extends HttpExecutionRouteDefinition,
  TVariant extends keyof TRoute['responses'] & string,
> = HttpExecutionResult<
  TVariant,
  TRoute['responses'][TVariant]['body'] extends StandardSchemaV1
    ? SchemaOutput<TRoute['responses'][TVariant]['body']>
    : undefined,
  ResponseHeadersOutput<TRoute['responses'][TVariant]>
>

type DeclaredHttpResults<TRoute extends HttpExecutionRouteDefinition> = {
  [TVariant in keyof TRoute['responses'] & string]: DeclaredHttpResult<
    TRoute,
    TVariant
  >
}[keyof TRoute['responses'] & string]

type ResponseHelpers<TRoute extends HttpExecutionRouteDefinition> = {
  readonly [TVariant in keyof TRoute['responses'] & string]: (
    value: ResponseValue<TRoute['responses'][TVariant]>,
  ) => DeclaredHttpResult<TRoute, TVariant>
}

export type HttpExecutionContext<
  TRoute extends HttpExecutionRouteDefinition = HttpExecutionRouteDefinition,
> = {
  readonly request: Request
  readonly params: HttpParamsValue<TRoute['request']>
  readonly query: RequestValue<TRoute['request'], 'query', URLSearchParams>
  readonly headers: RequestValue<TRoute['request'], 'headers', Headers>
  readonly body: RequestValue<TRoute['request'], 'body', undefined>
  readonly response: ResponseHelpers<TRoute>
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
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly name: string
  readonly contract: TContract
  readonly inject: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => HttpHandlers<TContract>
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
  readonly inject: readonly TokenLike[]
  readonly factory: (
    ...dependencies: any[]
  ) => Record<
    string,
    (
      context: HttpExecutionContext,
    ) => HttpExecutionResult | Promise<HttpExecutionResult>
  >
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
  name: '@loutrejs/http',
  compile(definition, context) {
    const routes = Object.entries(definition.contract.routes).map(
      ([name, route]) => {
        assertValidHttpMethod(route.method)
        const segments = parseHttpPath(route.path)
        return Object.freeze({
          name,
          method: route.method.toUpperCase(),
          path: route.path,
          segments,
          dispatch: createHttpDispatchKey(route.method, segments),
          definition: route,
          middlewares: route.middlewares ?? [],
        })
      },
    )
    return {
      kind: 'execution',
      id:
        definition.name ||
        `${context.moduleId}.http.${context.definitionIndex}`,
      executionKind: 'http.request',
      extension: definition.extension,
      dependencies: [
        ...new Set([
          ...definition.inject,
          ...routes.flatMap((route) =>
            route.middlewares.flatMap((middleware) => middleware.inject),
          ),
        ]),
      ],
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
        inject: definition.inject,
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
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> = HttpImplementationDefinition<TContract, TInject> &
  ExecutionDefinition<typeof httpExecutionExtension>

export function defineHttpContract<
  const TRoutes extends Readonly<Record<string, HttpExecutionRouteDefinition>>,
>(routes: TRoutes): HttpContract<TRoutes> {
  return Object.freeze({ kind: 'http-contract', routes })
}

export function defineHttpImplementation<
  const TContract extends HttpContract,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly inject?: TInject
  readonly factory: HttpImplementationDefinition<TContract, TInject>['factory']
}): HttpExecutionDefinition<TContract, TInject> {
  return defineExecution(httpExecutionExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    inject: definition.inject ?? ([] as unknown as TInject),
    factory: definition.factory,
  }) as HttpExecutionDefinition<TContract, TInject>
}

export function bindHttpServer(
  driver: HttpServerDriver,
): RuntimeCapabilityBinding<HttpServerDriver> {
  return { capability: HTTP_SERVER, value: driver }
}

export function defineHttpMiddleware<
  TContribution extends object = {},
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name: string
  readonly state?: Type<TContribution>
  readonly inject?: TInject
  readonly factory: HttpMiddleware<TContribution, TInject>['factory']
}): HttpMiddleware<TContribution, TInject> {
  return defineLayer<
    HttpMiddlewareContext,
    TContribution,
    HttpExecutionResult,
    TInject
  >(definition)
}

export function collectHttpRoutes(model: ApplicationModel) {
  // CLIがbundleしたApplicationではdescriptor identityが別になるため、Modelが一意性を検証したExtension名を使う。
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
    const dependencies = execution.compiled.inject.map((token) =>
      applicationRuntime.resolve(token),
    )
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
        () => execution.compiled.factory(...dependencies),
      ),
    )
  }
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
      for (const execution of executions) {
        for (const route of execution.compiled.routes) {
          if (route.method !== method) continue
          const params = matchHttpPath(route.segments, url.pathname)
          if (!params) continue
          const lease = applicationRuntime.beginExecution()
          const abortRequest = () => lease.abort(request.signal.reason)
          request.signal.addEventListener('abort', abortRequest, { once: true })
          if (request.signal.aborted) abortRequest()
          try {
            let context: HttpExecutionContext
            try {
              context = await createHttpContext(
                request,
                url,
                params,
                route,
                lease.signal,
              )
            } catch (error) {
              if (error instanceof SchemaValidationError) {
                return Response.json(
                  { error: 'Validation failed' },
                  { status: 400 },
                )
              }
              if (error instanceof SyntaxError) {
                return Response.json(
                  { error: 'Invalid request' },
                  { status: 400 },
                )
              }
              throw error
            }
            const handler = handlers.get(execution.id)?.[route.name]
            if (!handler) {
              throw new Error(
                `LUTRE_HTTP_HANDLER_MISSING: ${execution.id}.${route.name}`,
              )
            }
            const result = await composeLayers({
              context,
              layers: route.middlewares,
              resolve: (token) => applicationRuntime.resolve(token),
              terminal: async (middlewareContext) =>
                handler(middlewareContext as HttpExecutionContext),
            })
            return await finalizeHttpResult(route.definition, result)
          } catch {
            return Response.json(
              { error: 'Internal Server Error' },
              { status: 500 },
            )
          } finally {
            request.signal.removeEventListener('abort', abortRequest)
            lease.complete()
          }
        }
      }
      return Response.json({ error: 'Not Found' }, { status: 404 })
    },
  }
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
  const rawQuery = Object.fromEntries(url.searchParams)
  const query = definition?.query
    ? await validateSchema(definition.query, rawQuery)
    : url.searchParams
  const rawHeaders = Object.fromEntries(request.headers)
  const headers = definition?.headers
    ? await validateSchema(definition.headers, rawHeaders)
    : request.headers
  const rawBody = definition?.body ? await decodeBody(request) : undefined
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
    params,
    query,
    headers,
    body,
    response,
    signal,
  } as unknown as HttpExecutionContext
}

async function decodeBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]
  if (contentType === 'application/json') return request.json()
  if (contentType?.startsWith('text/')) return request.text()
  return request.arrayBuffer()
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
  if (body === undefined)
    return new Response(null, { status: response.status, headers })
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
