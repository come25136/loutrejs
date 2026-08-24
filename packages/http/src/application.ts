import {
  asModuleInstance,
  validateSchema,
  type ImplementationBinding,
  type ModuleInstance,
  type ModuleTemplate,
  type StandardSchemaV1,
} from '@loutrefw/core'
import {
  assertValidCompilation,
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrefw/compiler/runtime'
import {
  ApplicationRuntime,
  ConsoleLoggerBackend,
  executePipeline,
  Logger,
  normalizeUnknownError,
} from '@loutrefw/runtime'
import {
  runtimeLinkageTarget,
  type RuntimeLinkableApplication,
} from '@loutrefw/runtime/internal'
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
  handle(request: Request): Promise<Response>
}

export function createHttpApplication(options: {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
}): HttpApplication {
  const roots = options.modules.map(asModuleInstance)
  const graph = assertValidCompilation(compileApplication(roots))
  const runtime = new ApplicationRuntime(roots)
  const runtimeGraph = runtime.graph
  const container = runtime.container
  const routes = collectRoutes(runtimeGraph.modules)
  let initialization: Promise<void> | undefined
  const initialize = () => (initialization ??= runtime.initialize())

  return {
    [runtimeLinkageTarget]: (artifact) => runtime[runtimeLinkageTarget](artifact),
    graph,
    initialize,
    shutdown: (signal) => runtime.shutdown(signal),
    async handle(request) {
      await initialize()
      const url = new URL(request.url)
      const routeMatch = routes
        .map((route) => ({ route, params: route.match(url.pathname) }))
        .find(
          (candidate) =>
            candidate.params !== undefined &&
            candidate.route.method === request.method.toUpperCase(),
        )

      if (!routeMatch?.params) {
        return jsonResponse(404, { error: 'Not Found' })
      }

      try {
        const decoded = await decodeRequest(
          request,
          url,
          routeMatch.params,
          routeMatch.route.protocol.definition,
        )
        const raw: MutableHttpContext = {
          ...decoded,
          logger: new Logger(new ConsoleLoggerBackend(), {
            protocol: 'http',
            procedure: routeMatch.route.procedure,
            source: `${routeMatch.route.binding.implementation.name}.${routeMatch.route.procedure}`,
            executionId: crypto.randomUUID(),
          }),
        }
        const logical = await executePipeline<MutableHttpContext, LogicalHttpResult>(
          routeMatch.route.protocol.definition.pipeline,
          {
            context: raw,
            validate: async (layer, context) => {
              const schema = routeMatch.route.protocol.definition.input?.[
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
        return await finalizeResponse(
          routeMatch.route.protocol.definition,
          logical,
        )
      } catch (error) {
        if (isValidationError(error)) {
          return jsonResponse(400, { error: 'Validation failed' })
        }
        const mapped = mapDeclaredError(
          routeMatch.route.protocol.definition,
          error,
        )
        if (mapped) {
          try {
            return await finalizeResponse(
              routeMatch.route.protocol.definition,
              mapped,
            )
          } catch {
            return jsonResponse(500, { error: 'Internal Server Error' })
          }
        }
        const normalized = normalizeUnknownError(error, {
          protocol: 'http',
          procedure: routeMatch.route.procedure,
        })
        return jsonResponse(500, {
          error: 'Internal Server Error',
          errorId: normalized.errorId,
        })
      }
    },
  }
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
  if (definition.input?.body) {
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
  container: import('@loutrefw/runtime').Container,
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
  } as HttpControllerContext<HttpProtocol>
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
        response.headers,
        result.headers,
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
    mergeResponseHeaders(response.headers, result.headers),
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

function mapDeclaredError(
  definition: HttpProtocolDefinition,
  error: unknown,
): LogicalHttpResult | undefined {
  for (const [variant, response] of Object.entries(definition.responses)) {
    const errorDefinition = response.error as
      | {
          readonly is?: (error: unknown) => boolean
        }
      | undefined
    if (errorDefinition?.is?.(error)) {
      return {
        kind: 'http-result',
        variant,
        body: (error as { readonly data: unknown }).data,
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
