import {
  asModuleInstance,
  validateSchema,
  type ImplementationBinding,
  type ModuleInstance,
  type ModuleTemplate,
  type StandardSchemaV1,
} from '@loutrejs/core'
import {
  assertValidCompilation,
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/compiler/runtime'
import {
  ApplicationRuntime,
  executePipeline,
  Logger,
  normalizeUnknownError,
} from '@loutrejs/runtime'
import {
  runtimeLinkageTarget,
  type RuntimeLinkableApplication,
} from '@loutrejs/runtime/internal'
import type {
  HttpControllerContext,
  HttpHeaders,
  HttpProtocol,
  HttpProtocolDefinition,
  LogicalHttpResult,
} from './definitions.js'

interface HttpRoute {
  readonly method: string
  readonly path: string
  readonly match: (pathname: string) => Record<string, string> | undefined
  readonly protocol: HttpProtocol
  readonly binding: ImplementationBinding
  readonly procedure: string
}

export interface HttpApplication extends RuntimeLinkableApplication {
  readonly graph: ApplicationGraphIR
  initialize(): Promise<void>
  shutdown(signal?: string): Promise<void>
  onServerListening(url: string): void
  handle(request: Request): Promise<Response>
}

export interface HttpApplicationLifecycle {
  readonly onServerListening?: (url: string) => void
}

export function createHttpApplication(options: {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly lifecycle?: HttpApplicationLifecycle
  readonly logger?: Logger
}): HttpApplication {
  const roots = options.modules.map(asModuleInstance)
  const graph = assertValidCompilation(compileApplication(roots))
  const applicationLogger = options.logger ?? new Logger()
  const runtime = new ApplicationRuntime(roots, { logger: applicationLogger })
  const runtimeGraph = runtime.graph
  const container = runtime.container
  const routes = collectRoutes(runtimeGraph.modules)
  const logger = applicationLogger.child({ protocol: 'http' })
  let initialization: Promise<void> | undefined
  const initialize = () => (initialization ??= runtime.initialize())

  return {
    [runtimeLinkageTarget]: (artifact) => runtime[runtimeLinkageTarget](artifact),
    graph,
    initialize,
    shutdown: (signal) => runtime.shutdown(signal),
    onServerListening: (url) => options.lifecycle?.onServerListening?.(url),
    async handle(request) {
      const startedAt = Date.now()
      const url = new URL(request.url)
      let requestLogger = logger.child({
        executionId: crypto.randomUUID(),
        method: request.method.toUpperCase(),
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
      const routeMatch = routes
        .map((route) => ({ route, params: route.match(url.pathname) }))
        .find(
          (candidate) =>
            candidate.params !== undefined &&
            candidate.route.method === request.method.toUpperCase(),
        )

      if (!routeMatch?.params) {
        return logHttpResponse(
          requestLogger,
          startedAt,
          jsonResponse(404, { error: 'Not Found' }),
        )
      }

      requestLogger = requestLogger.child({
        procedure: routeMatch.route.procedure,
        source: `${routeMatch.route.binding.implementation.name}.${routeMatch.route.procedure}`,
      })

      try {
        const decoded = await decodeRequest(
          request,
          url,
          routeMatch.params,
          routeMatch.route.protocol.definition,
        )
        const raw: MutableHttpContext = {
          ...decoded,
          logger: requestLogger,
        }
        const logical = await executePipeline<MutableHttpContext, LogicalHttpResult>(
          routeMatch.route.protocol.definition.pipeline,
          {
            context: raw,
            validate: async (layer, context) => {
              const schema = routeMatch.route.protocol.definition.request?.[
                layer.part
              ] as StandardSchemaV1 | undefined
              if (schema) {
                try {
                  context[layer.part] = await validateSchema(
                    schema,
                    context[layer.part],
                  )
                } catch (error) {
                  throw new HttpInputValidationError(error)
                }
              }
            },
            terminal: async (_layer, context) =>
              invokeController(routeMatch.route, context, container),
          },
        )
        return logHttpResponse(
          requestLogger,
          startedAt,
          await finalizeResponse(
            routeMatch.route.protocol.definition,
            logical,
          ),
        )
      } catch (error) {
        if (isValidationError(error)) {
          return logHttpResponse(
            requestLogger,
            startedAt,
            jsonResponse(400, { error: 'Validation failed' }),
          )
        }
        let mapped: LogicalHttpResult | undefined
        try {
          mapped = await mapDeclaredError(
            routeMatch.route.protocol.definition,
            error,
          )
        } catch (mappingError) {
          return logHttpResponse(
            requestLogger,
            startedAt,
            createInternalErrorResponse(mappingError, requestLogger),
          )
        }
        if (mapped) {
          try {
            return logHttpResponse(
              requestLogger,
              startedAt,
              await finalizeResponse(
                routeMatch.route.protocol.definition,
                mapped,
              ),
            )
          } catch (finalizationError) {
            return logHttpResponse(
              requestLogger,
              startedAt,
              createInternalErrorResponse(finalizationError, requestLogger),
            )
          }
        }
        return logHttpResponse(
          requestLogger,
          startedAt,
          createInternalErrorResponse(error, requestLogger),
        )
      }
    },
  }
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
  params: unknown
  query: unknown
  headers: unknown
  body: unknown
  logger: Logger
}

type DecodedHttpContext = Pick<
  MutableHttpContext,
  'params' | 'query' | 'headers' | 'body'
>

async function decodeRequest(
  request: Request,
  url: URL,
  params: Record<string, string>,
  definition: HttpProtocolDefinition,
): Promise<DecodedHttpContext> {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of url.searchParams) {
    const current = query[key]
    query[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value]
  }

  const headers = Object.fromEntries(request.headers.entries())
  let body: unknown = undefined
  if (definition.request?.body) {
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim()
    if (mediaType === 'application/json') {
      body = await request.json()
    } else if (mediaType?.startsWith('text/')) {
      body = await request.text()
    } else {
      body = request.body
    }
  }

  return { params, query, headers, body }
}

async function invokeController(
  route: HttpRoute,
  raw: MutableHttpContext,
  container: import('@loutrejs/runtime').Container,
): Promise<LogicalHttpResult> {
  const controller = await container.resolveImplementation(
    route.binding.implementation,
  ) as Record<PropertyKey, unknown>
  const method = controller[route.procedure as keyof typeof controller]
  if (typeof method !== 'function') {
    throw new Error(
      `${route.binding.implementation.name}.${route.procedure} is not callable`,
    )
  }

  const response = Object.fromEntries(
    Object.keys(route.protocol.definition.responses).map((variant) => [
      variant,
      (
        result: { readonly body: unknown; readonly headers?: HttpHeaders },
      ): LogicalHttpResult => ({
        kind: 'http-result',
        variant,
        body: result.body,
        ...(result.headers === undefined ? {} : { headers: result.headers }),
      }),
    ]),
  )
  const context = {
    ...raw,
    response,
  } as unknown as HttpControllerContext<HttpProtocol>
  return Reflect.apply(method, controller, [context]) as Promise<LogicalHttpResult>
}

async function finalizeResponse(
  definition: HttpProtocolDefinition,
  result: LogicalHttpResult,
): Promise<Response> {
  if (result?.kind !== 'http-result') {
    throw new Error('Controller returned a non-HTTP logical result')
  }
  const response = definition.responses[result.variant]
  if (!response) {
    throw new Error(`Undeclared HTTP response variant: ${result.variant}`)
  }
  const responseHeaders = await validateResponseHeaders(
    response.headers,
    result.headers,
  )
  if (response.stream === 'server') {
    if (!isAsyncIterable(result.body)) {
      throw new Error('server-stream responseにはAsyncIterableが必要です')
    }
    const encoder = new TextEncoder()
    const iterator = result.body[Symbol.asyncIterator]()
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next()
          if (next.done) {
            controller.close()
            return
          }
          const value = await validateSchema(response.body, next.value)
          controller.enqueue(encoder.encode(`data:${JSON.stringify(value)}\n\n`))
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel(reason) {
        await iterator.return?.(reason)
      },
    })
    return new Response(stream, {
      status: response.status,
      headers: mergeResponseHeaders(
        response.staticHeaders,
        responseHeaders,
        {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
      ),
    })
  }
  const body = await validateSchema(response.body, result.body)
  return jsonResponse(
    response.status,
    body,
    mergeResponseHeaders(response.staticHeaders, responseHeaders),
  )
}

async function validateResponseHeaders(
  schema: StandardSchemaV1 | undefined,
  headers: HttpHeaders | undefined,
): Promise<HttpHeaders | undefined> {
  if (!schema) {
    if (headers !== undefined) {
      throw new Error('未宣言のHTTP response headerが返されました')
    }
    return undefined
  }

  const validated = await validateSchema(schema, headers)
  if (validated === undefined) return undefined
  if (!isHttpHeaders(validated)) {
    throw new Error('HTTP response header schemaの出力が不正です')
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
    for (const binding of module.definition.implementations ?? []) {
      if (binding.protocol !== 'http') continue
      const procedureNames =
        binding.procedures ??
        Object.entries(binding.contract.procedures)
          .filter(([, procedure]) => 'http' in procedure.protocols)
          .map(([name]) => name)

      for (const procedure of procedureNames) {
        const protocol = binding.contract.procedures[procedure]?.protocols.http
        if (!protocol || protocol.protocol !== 'http') continue
        const typed = protocol as HttpProtocol
        routes.push({
          method: typed.definition.method.toUpperCase(),
          path: typed.definition.path,
          match: compilePath(typed.definition.path),
          protocol: typed,
          binding,
          procedure,
        })
      }
    }
  }
  return routes
}

function compilePath(path: string) {
  const names: string[] = []
  const escaped = path
    .split(/(\{[^}]+\})/g)
    .map((part) => {
      const match = /^\{([^}]+)\}$/.exec(part)
      if (match?.[1]) {
        names.push(match[1])
        return '([^/]+)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  const pattern = new RegExp(`^${escaped}$`)
  return (pathname: string): Record<string, string> | undefined => {
    const match = pattern.exec(pathname)
    if (!match) return undefined
    return Object.fromEntries(
      names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]),
    )
  }
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

async function mapDeclaredError(
  definition: HttpProtocolDefinition,
  error: unknown,
): Promise<LogicalHttpResult | undefined> {
  for (const [variant, response] of Object.entries(definition.responses)) {
    const errorMapping = response.error
    if (errorMapping?.definition.is(error)) {
      const result = await errorMapping.map(error)
      if (typeof result !== 'object' || result === null || !('body' in result)) {
        throw new Error('HTTP error mappingはbodyを返す必要があります')
      }
      return {
        kind: 'http-result',
        variant,
        body: result.body,
        ...('headers' in result ? { headers: result.headers as HttpHeaders } : {}),
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
