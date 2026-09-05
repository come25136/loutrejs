import {
  SchemaValidationError,
  validateSchema,
  type ImplementationDescriptor,
  type ModuleInstance,
  type StandardSchemaV1,
} from '../core/index.js'
import type { ApplicationGraphIR } from '../graph/index.js'
import {
  ApplicationRuntime,
  executePipeline,
  Logger,
  normalizeUnknownError,
} from '../runtime/index.js'
import {
  createCorsActualResponseHeaders,
  createCorsPreflightResponseHeaders,
} from './cors.js'
import type {
  HttpControllerContext,
  HttpHeaders,
  HttpParamsSchemas,
  HttpProtocol,
  HttpProtocolDefinition,
  LogicalHttpResult,
} from './definitions.js'
import {
  compareHttpPathSpecificity,
  HttpPathDecodeError,
  type HttpPathSegment,
  matchHttpPath,
  parseHttpPath,
} from './path.js'
import { validateHttpParamsSchemas } from './params.js'

interface HttpRoute {
  readonly method: string
  readonly path: string
  readonly segments: readonly HttpPathSegment[]
  readonly dispatchKey: string
  readonly protocol: HttpProtocol
  readonly implementation: ImplementationDescriptor
  readonly procedure: string
}

export interface HttpProtocolExecution {
  readonly graph: ApplicationGraphIR
  initialize(): Promise<void>
  shutdown(signal?: string): Promise<void>
  onServerListening(url: string): void
  handle(request: Request): Promise<Response>
}

export interface HttpProtocolExecutionLifecycle {
  readonly onServerListening?: (url: string) => void
}

export function createHttpExecution(options: {
  readonly runtime: ApplicationRuntime
  readonly graph: ApplicationGraphIR
  readonly lifecycle?: HttpProtocolExecutionLifecycle
  readonly logger?: Logger
}): HttpProtocolExecution {
  const { runtime } = options
  const graph = options.graph
  const applicationLogger = options.logger ?? new Logger()
  const runtimeGraph = runtime.graph
  const container = runtime.container
  const routes = collectRoutes(runtimeGraph.modules)
  const logger = applicationLogger.child({ protocol: 'http' })
  let initialization: Promise<void> | undefined
  const initialize = () => (initialization ??= runtime.initialize())

  return {
    graph,
    initialize,
    shutdown: (signal) => runtime.shutdown(signal),
    onServerListening: (url) => options.lifecycle?.onServerListening?.(url),
    async handle(request) {
      const startedAt = Date.now()
      const url = new URL(request.url)
      const method = request.method.toUpperCase()
      let requestLogger = logger.child({
        executionId: crypto.randomUUID(),
        method,
        path: url.pathname,
      })
      try {
        await initialize()
      } catch (error) {
        return logHttpResponse(
          requestLogger,
          startedAt,
          createInternalErrorResponse(error, requestLogger),
        )
      }

      return runtime.execute(async () => {
        if (isCorsPreflightRequest(request)) {
          try {
            const requestedMethod = request.headers
              .get('access-control-request-method')!
              .toUpperCase()
            const preflightMatch = findRoute(
              routes,
              requestedMethod,
              url.pathname,
            )
            if (preflightMatch) {
              const headers = await createCorsPreflightResponseHeaders(
                preflightMatch.route.protocol.definition.pipeline,
                request,
                preflightMatch.route.method,
              )
              if (headers) {
                requestLogger = requestLogger.child({
                  procedure: preflightMatch.route.procedure,
                  source: `${preflightMatch.route.implementation.name}.${preflightMatch.route.procedure}`,
                })
                return logHttpResponse(
                  requestLogger,
                  startedAt,
                  new Response(null, { status: 204, headers }),
                )
              }
            }
          } catch (error) {
            return logHttpResponse(
              requestLogger,
              startedAt,
              isDecodeError(error)
                ? jsonResponse(400, { error: 'Invalid request' })
                : createInternalErrorResponse(error, requestLogger),
            )
          }
        }

        let routeMatch:
          | {
              readonly route: HttpRoute
              readonly params: Record<string, string>
            }
          | undefined
        try {
          routeMatch = findRoute(routes, method, url.pathname)
        } catch (error) {
          return logHttpResponse(
            requestLogger,
            startedAt,
            isDecodeError(error)
              ? jsonResponse(400, { error: 'Invalid request' })
              : createInternalErrorResponse(error, requestLogger),
          )
        }

        if (!routeMatch?.params) {
          return logHttpResponse(
            requestLogger,
            startedAt,
            jsonResponse(404, { error: 'Not Found' }),
          )
        }

        requestLogger = requestLogger.child({
          procedure: routeMatch.route.procedure,
          source: `${routeMatch.route.implementation.name}.${routeMatch.route.procedure}`,
        })

        let corsHeaders: Headers | undefined
        try {
          corsHeaders = await createCorsActualResponseHeaders(
            routeMatch.route.protocol.definition.pipeline,
            request,
          )
        } catch (error) {
          return logHttpResponse(
            requestLogger,
            startedAt,
            createInternalErrorResponse(error, requestLogger),
          )
        }
        const complete = (response: Response): Response =>
          logHttpResponse(
            requestLogger,
            startedAt,
            applyFrameworkHeaders(response, corsHeaders),
          )

        try {
          const decoded = decodeRequest(
            request,
            url,
            routeMatch.params,
            routeMatch.route.protocol.definition,
          )
          const raw: MutableHttpContext = {
            input: decoded,
            state: {},
            logger: requestLogger,
            signal: request.signal,
          }
          const logical = await executePipeline<
            MutableHttpContext,
            LogicalHttpResult
          >(routeMatch.route.protocol.definition.pipeline, {
            context: raw,
            layer: (descriptor) => container.layerRuntime(descriptor),
            validate: async (layer, context) => {
              const declared = routeMatch.route.protocol.definition.request?.[
                layer.part
              ] as StandardSchemaV1 | HttpParamsSchemas | undefined
              const schema = declared
              if (schema) {
                try {
                  let input = context.input[layer.part]
                  if (layer.part === 'headers') {
                    input = requestHeadersForValidation(request.headers)
                  } else if (layer.part === 'body') {
                    input = await decodeRequestBody(
                      request,
                      validatedContentType(context.input.headers),
                    )
                  }
                  context.input[layer.part] =
                    layer.part === 'params'
                      ? await validateHttpParamsSchemas(
                          schema as HttpParamsSchemas,
                          context.input.params as Record<string, string>,
                        )
                      : await validateSchema(schema as StandardSchemaV1, input)
                } catch (error) {
                  if (error instanceof HttpInputDecodeError) {
                    throw error
                  }
                  if (
                    layer.part === 'headers' &&
                    routeMatch.route.protocol.definition.request?.body &&
                    error instanceof SchemaValidationError &&
                    hasContentTypeIssue(error)
                  ) {
                    throw new HttpUnsupportedMediaTypeError(
                      normalizeMediaType(request.headers.get('content-type')),
                    )
                  }
                  throw new HttpInputValidationError(error)
                }
              }
            },
            terminal: async (_layer, context) =>
              invokeController(routeMatch.route, context, container),
          })
          return complete(
            await finalizeResponse(
              routeMatch.route.protocol.definition,
              logical,
              request.signal,
            ),
          )
        } catch (error) {
          if (error instanceof HttpUnsupportedMediaTypeError) {
            return complete(
              jsonResponse(415, { error: 'Unsupported Media Type' }),
            )
          }
          if (isDecodeError(error)) {
            return complete(jsonResponse(400, { error: 'Invalid request' }))
          }
          if (isValidationError(error)) {
            return complete(jsonResponse(400, { error: 'Validation failed' }))
          }
          let mapped: LogicalHttpResult | undefined
          try {
            mapped = await mapDeclaredError(
              routeMatch.route.protocol.definition,
              error,
            )
          } catch (mappingError) {
            return complete(
              createInternalErrorResponse(mappingError, requestLogger),
            )
          }
          if (mapped) {
            try {
              return complete(
                await finalizeResponse(
                  routeMatch.route.protocol.definition,
                  mapped,
                  request.signal,
                ),
              )
            } catch (finalizationError) {
              return complete(
                createInternalErrorResponse(finalizationError, requestLogger),
              )
            }
          }
          return complete(createInternalErrorResponse(error, requestLogger))
        }
      })
    },
  }
}

function findRoute(
  routes: readonly HttpRoute[],
  method: string,
  pathname: string,
):
  | { readonly route: HttpRoute; readonly params: Record<string, string> }
  | undefined {
  const candidate = routes
    .filter((route) => route.method === method)
    .map((route) => ({
      route,
      params: matchHttpPath(route.segments, pathname),
    }))
    .find((match) => match.params !== undefined)
  return candidate?.params === undefined
    ? undefined
    : { route: candidate.route, params: candidate.params }
}

function isCorsPreflightRequest(request: Request): boolean {
  return (
    request.method.toUpperCase() === 'OPTIONS' &&
    request.headers.has('origin') &&
    request.headers.has('access-control-request-method')
  )
}

function applyFrameworkHeaders(
  response: Response,
  frameworkHeaders: Headers | undefined,
): Response {
  if (!frameworkHeaders) return response
  frameworkHeaders.forEach((value, name) => {
    if (name.toLowerCase() === 'vary') {
      for (const item of value.split(',')) {
        appendVary(response.headers, item.trim())
      }
      return
    }
    response.headers.set(name, value)
  })
  return response
}

function appendVary(headers: Headers, value: string): void {
  if (value.length === 0) return
  const current = headers.get('vary')
  if (current === null) {
    headers.set('vary', value)
    return
  }
  const values = current
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  headers.set('vary', values.join(', '))
}

function logHttpResponse(
  logger: Logger,
  startedAt: number,
  response: Response,
): Response {
  logger.info('HTTP request completed', {
    event: 'http.request.completed',
    status: response.status,
    durationMs: Math.max(0, Date.now() - startedAt),
  })
  return response
}

function createInternalErrorResponse(error: unknown, logger: Logger): Response {
  const normalized = normalizeUnknownError(error, logger.context)
  logger.error('Unhandled application error', {
    event: 'application.error',
    error: {
      code: normalized.code,
      id: normalized.errorId,
      name: error instanceof Error ? error.name : typeof error,
      message: normalized.message,
      ...(normalized.stack === undefined ? {} : { stack: normalized.stack }),
      ...(normalized.cause === undefined ? {} : { cause: normalized.cause }),
    },
  })
  return jsonResponse(500, {
    error: 'Internal Server Error',
    errorId: normalized.errorId,
  })
}

interface MutableHttpContext extends Record<string, unknown> {
  input: DecodedHttpContext
  state: Record<string, unknown>
  logger: Logger
  signal: AbortSignal
}

interface DecodedHttpContext {
  params: unknown
  query: unknown
  headers: unknown
  body: unknown
}

function decodeRequest(
  request: Request,
  url: URL,
  params: Record<string, string>,
  definition: HttpProtocolDefinition,
): DecodedHttpContext {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of url.searchParams) {
    const current = query[key]
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  }

  const headers = Object.fromEntries(request.headers.entries())
  const body = definition.request?.body ? request.body : undefined

  return { params, query, headers, body }
}

function requestHeadersForValidation(headers: Headers): Record<string, string> {
  const decoded = Object.fromEntries(headers.entries())
  const contentType = normalizeMediaType(headers.get('content-type'))
  if (contentType) decoded['content-type'] = contentType
  return decoded
}

function validatedContentType(headers: unknown): string {
  if (typeof headers !== 'object' || headers === null) {
    throw new TypeError('validate.body requires validated request headers')
  }
  const contentType = (headers as Record<string, unknown>)['content-type']
  if (typeof contentType !== 'string' || contentType.length === 0) {
    throw new TypeError(
      'validate.body requires request.headers content-type to resolve to a string',
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

async function decodeRequestBody(
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

async function invokeController(
  route: HttpRoute,
  raw: MutableHttpContext,
  container: import('../runtime/index.js').Container,
): Promise<LogicalHttpResult> {
  const controller = container.implementationRuntime(
    route.implementation,
  ) as Record<PropertyKey, unknown>
  const method = controller[route.procedure as keyof typeof controller]
  if (typeof method !== 'function') {
    throw new Error(
      `${route.implementation.name}.${route.procedure} is not callable`,
    )
  }

  const response = Object.fromEntries(
    Object.keys(route.protocol.definition.responses).map((responseName) => [
      responseName,
      (result: {
        readonly body: unknown
        readonly headers?: HttpHeaders
      }): LogicalHttpResult => ({
        kind: 'http-result',
        response: responseName,
        body: result.body,
        ...(result.headers === undefined ? {} : { headers: result.headers }),
      }),
    ]),
  )
  const context = {
    ...raw,
    response,
  } as unknown as HttpControllerContext<HttpProtocol>
  return Reflect.apply(method, controller, [
    context,
  ]) as Promise<LogicalHttpResult>
}

async function finalizeResponse(
  definition: HttpProtocolDefinition,
  result: LogicalHttpResult,
  signal: AbortSignal,
): Promise<Response> {
  if (result?.kind !== 'http-result') {
    throw new Error('Controller returned a non-HTTP logical result')
  }
  const response = definition.responses[result.response]
  if (!response) {
    throw new Error(`Undeclared HTTP response: ${result.response}`)
  }
  const responseHeaders = await validateResponseHeaders(
    response.headers,
    result.headers,
  )
  if (response.stream === 'server') {
    if (!isAsyncIterable(result.body)) {
      throw new Error('Server-stream response requires an AsyncIterable')
    }
    const encoder = new TextEncoder()
    const iterator = result.body[Symbol.asyncIterator]()
    let finished = false
    let abort: (() => void) | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        abort = () => {
          if (finished) return
          finished = true
          signal.removeEventListener('abort', abort!)
          void iterator.return?.(signal.reason).finally(() => {
            controller.error(
              signal.reason ?? new Error('HTTP request was aborted'),
            )
          })
        }
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      },
      async pull(controller) {
        if (finished) return
        try {
          const next = await iterator.next()
          if (next.done) {
            finished = true
            if (abort) signal.removeEventListener('abort', abort)
            controller.close()
            return
          }
          const value = await validateSchema(response.body, next.value)
          controller.enqueue(
            encoder.encode(`data:${JSON.stringify(value)}\n\n`),
          )
        } catch (error) {
          finished = true
          if (abort) signal.removeEventListener('abort', abort)
          controller.error(error)
        }
      },
      async cancel(reason) {
        if (finished) return
        finished = true
        if (abort) signal.removeEventListener('abort', abort)
        await iterator.return?.(reason)
      },
    })
    return new Response(stream, {
      status: response.status,
      headers: mergeResponseHeaders(response.staticHeaders, responseHeaders, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      }),
    })
  }
  const body = await validateSchema(response.body, result.body)
  const headers = mergeResponseHeaders(response.staticHeaders, responseHeaders)
  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    if (body !== undefined) {
      throw new Error(`HTTP ${response.status} response body must be undefined`)
    }
    return new Response(undefined, { status: response.status, headers })
  }
  return jsonResponse(response.status, body, headers)
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

function collectRoutes(modules: readonly ModuleInstance[]): HttpRoute[] {
  const routes: HttpRoute[] = []
  for (const module of modules) {
    for (const implementation of module.definition.implementations ?? []) {
      if (implementation.protocol !== 'http') continue
      for (const procedure of implementation.procedures) {
        const protocol =
          implementation.contract.procedures[procedure]?.protocols.http
        if (!protocol || protocol.protocol !== 'http') continue
        const typed = protocol as HttpProtocol
        routes.push({
          method: typed.definition.method.toUpperCase(),
          path: typed.definition.path,
          segments: parseHttpPath(typed.definition.path),
          dispatchKey: typed.dispatchKey,
          protocol: typed,
          implementation,
          procedure,
        })
      }
    }
  }
  return routes.toSorted((left, right) =>
    compareHttpPathSpecificity(left.segments, right.segments),
  )
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Headers = new Headers(),
): Response {
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

function mergeResponseHeaders(
  declared: HttpHeaders | undefined,
  dynamic: HttpHeaders | undefined,
  framework: HttpHeaders | undefined = undefined,
): Headers {
  const headers = new Headers()
  applyResponseHeaders(headers, declared)
  applyResponseHeaders(headers, dynamic)
  applyResponseHeaders(headers, framework)
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

function isValidationError(error: unknown): boolean {
  return error instanceof HttpInputValidationError
}

function isDecodeError(error: unknown): boolean {
  return (
    error instanceof HttpInputDecodeError ||
    error instanceof HttpPathDecodeError
  )
}

async function mapDeclaredError(
  definition: HttpProtocolDefinition,
  error: unknown,
): Promise<LogicalHttpResult | undefined> {
  for (const [responseName, response] of Object.entries(definition.responses)) {
    const errorMapping = response.error
    if (errorMapping?.definition.is(error)) {
      const result = await errorMapping.map(error)
      if (
        typeof result !== 'object' ||
        result === null ||
        !('body' in result)
      ) {
        throw new Error('HTTP error mapping must return a body')
      }
      return {
        kind: 'http-result',
        response: responseName,
        body: result.body,
        ...('headers' in result
          ? { headers: result.headers as HttpHeaders }
          : {}),
      }
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

class HttpInputValidationError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP input validation failed', { cause })
    this.name = 'HttpInputValidationError'
  }
}

class HttpInputDecodeError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP input decode failed', { cause })
    this.name = 'HttpInputDecodeError'
  }
}

class HttpUnsupportedMediaTypeError extends Error {
  constructor(readonly actual: string | undefined) {
    super(`Unsupported HTTP request media type: ${actual ?? '(missing)'}`)
    this.name = 'HttpUnsupportedMediaTypeError'
  }
}
