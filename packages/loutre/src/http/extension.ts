import {
  defineExecution,
  defineExecutionExtension,
  runtimeCapability,
  runInInjectionContext,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type RuntimeCapabilityBinding,
  type SchemaOutput,
  type StandardSchemaV1,
  type TokenLike,
  type TokenValue,
} from '../core/index.js'
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

export interface HttpExecutionResponseDefinition {
  readonly status: number
  readonly body?: StandardSchemaV1
  readonly headers?: Readonly<Record<string, string>>
}

export interface HttpExecutionRouteDefinition {
  readonly method: string
  readonly path: string
  readonly request?: HttpExecutionRequestDefinition
  readonly responses: Readonly<Record<string, HttpExecutionResponseDefinition>>
}

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

export interface HttpExecutionResult<
  TVariant extends string = string,
  TBody = unknown,
> {
  readonly kind: 'http-result'
  readonly response: TVariant
  readonly body: TBody
  readonly headers?: HeadersInit
}

type ResponseHelpers<TRoute extends HttpExecutionRouteDefinition> = {
  readonly [TVariant in keyof TRoute['responses'] & string]: (
    value: TRoute['responses'][TVariant]['body'] extends StandardSchemaV1
      ? {
          readonly body: SchemaOutput<TRoute['responses'][TVariant]['body']>
          readonly headers?: HeadersInit
        }
      : { readonly body?: undefined; readonly headers?: HeadersInit },
  ) => HttpExecutionResult<
    TVariant,
    TRoute['responses'][TVariant]['body'] extends StandardSchemaV1
      ? SchemaOutput<TRoute['responses'][TVariant]['body']>
      : undefined
  >
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
}

export type HttpHandlers<TContract extends HttpContract> = {
  readonly [TName in keyof TContract['routes']]: (
    context: HttpExecutionContext<TContract['routes'][TName]>,
  ) => HttpExecutionResult | Promise<HttpExecutionResult>
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
      dependencies: definition.inject,
      capabilities: [HTTP_SERVER],
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

export const executionHttp = Object.freeze({
  contract: defineHttpContract,
  implementation: defineHttpImplementation,
  extension: httpExecutionExtension,
  serverCapability: HTTP_SERVER,
  bindServer: bindHttpServer,
})

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
            const context = await createHttpContext(
              request,
              url,
              params,
              route,
              lease.signal,
            )
            const handler = handlers.get(execution.id)?.[route.name]
            if (!handler) {
              throw new Error(
                `LUTRE_HTTP_HANDLER_MISSING: ${execution.id}.${route.name}`,
              )
            }
            const result = await handler(context)
            return await finalizeHttpResult(route.definition, result)
          } catch (error) {
            return Response.json(
              {
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : String(error),
              },
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
        value: { readonly body?: unknown; readonly headers?: HeadersInit } = {},
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
  const headers = new Headers(response.headers)
  if (result.headers) {
    new Headers(result.headers).forEach((value, name) =>
      headers.set(name, value),
    )
  }
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
