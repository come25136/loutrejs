import {
  type HttpContractRawRouteDefinition,
  httpContractRawRouteBrand,
  type HttpContractRawRoute,
  type HttpRawRouteDefinition,
  type HttpExecutionRouteDefinition,
  type HttpResponseHeadersDefinition,
  type HttpHeaders,
  type AnyHttpMiddleware,
  type HttpValidationMiddleware,
  type HttpMiddlewareContext,
  type HttpExecutionResult,
  type HttpRouteMiddleware,
} from './contract.js'
import {
  assertValidHttpMethod,
  parseHttpPath,
  createHttpDispatchKey,
  type HttpPathSegment,
} from './path.js'
import {
  inheritSourceLocation,
  getSourceLocation,
  type SourceLocation,
  type StandardSchemaV1,
  defineLayer,
  validateSchema,
  SchemaValidationError,
} from '../core/index.js'
import {
  httpProcedureName,
  normalizeHttpMethod,
  type HttpPathTemplate,
  type HttpResponseStatus,
} from './identity.js'
import {
  type CompiledHttpRawRoute,
  type CompiledHttpContractRoute,
  type CompiledHttpResponseDefinition,
  type CompiledHttpRouteDefinition,
} from './compiled.js'
import {
  isStandardSchema,
  isResponseHeadersWithDefaults,
} from './codecs/response.js'
import { match as patternMatch } from 'ts-pattern'
import {
  decodeBody,
  validatedContentType,
  HttpInputValidationError,
} from './codecs/request.js'

export function snapshotHttpContractRawRoute(
  route: HttpContractRawRouteDefinition,
): HttpContractRawRoute {
  if (route.method !== '*') assertValidHttpMethod(route.method)
  parseHttpPath(route.path)
  return inheritSourceLocation(
    Object.freeze({
      ...route,
      method: route.method.toUpperCase(),
      [httpContractRawRouteBrand]: true as const,
      ...(route.middlewares === undefined
        ? {}
        : { middlewares: Object.freeze([...route.middlewares]) }),
    }),
    route,
  )
}

export function compileRawRoute(
  route: HttpRawRouteDefinition,
): CompiledHttpRawRoute {
  if (route.method !== '*') assertValidHttpMethod(route.method)
  const segments = parseHttpPath(route.path)
  const source = getSourceLocation(route)
  return Object.freeze({
    kind: 'raw',
    name: httpProcedureName('raw'),
    method:
      route.method === '*' ? ('*' as const) : normalizeHttpMethod(route.method),
    path: route.path as HttpPathTemplate,
    segments,
    dispatch: createHttpDispatchKey(
      normalizeHttpMethod(route.method),
      segments,
    ),
    middlewares: Object.freeze([...(route.middlewares ?? [])]),
    ...(source === undefined ? {} : { source }),
    ...(route.protocol === undefined ? {} : { protocol: route.protocol }),
  })
}

export function compileHttpRoute(
  name: string,
  route: HttpExecutionRouteDefinition,
  routeSourceFallback?: SourceLocation,
): CompiledHttpContractRoute {
  if (route.method === '*')
    throw new TypeError(
      'The wildcard method (*) is only supported by http.raw().',
    )
  assertValidHttpMethod(route.method)
  const segments = parseHttpPath(route.path)
  assertValidHttpRouteDefinition(route, segments)
  const definition = snapshotHttpRouteDefinition(route)
  const routeSource = getSourceLocation(route) ?? routeSourceFallback
  return Object.freeze({
    kind: 'contract',
    name: httpProcedureName(name),
    method:
      route.method === '*' ? ('*' as const) : normalizeHttpMethod(route.method),
    path: route.path as HttpPathTemplate,
    segments,
    dispatch: createHttpDispatchKey(
      normalizeHttpMethod(route.method),
      segments,
    ),
    definition,
    middlewares: compileHttpMiddlewares(definition),
    ...(routeSource === undefined ? {} : { source: routeSource }),
  })
}

function snapshotHttpRouteDefinition(
  route: HttpExecutionRouteDefinition,
): CompiledHttpRouteDefinition {
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
          status: response.status as HttpResponseStatus,
          ...(response.headers === undefined
            ? {}
            : { headers: snapshotHttpResponseHeaders(response.headers) }),
          ...(response.error === undefined
            ? {}
            : { error: Object.freeze({ ...response.error }) }),
        }) as CompiledHttpResponseDefinition,
      ]),
    ),
  )
  return inheritSourceLocation(
    Object.freeze({
      ...route,
      ...(route.tags === undefined
        ? {}
        : { tags: Object.freeze([...route.tags]) }),
      ...(request === undefined ? {} : { request }),
      responses,
      ...(route.middlewares === undefined
        ? {}
        : { middlewares: Object.freeze([...route.middlewares]) }),
    }),
    route,
  )
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
    patternMatch(middleware)
      .with({ kind: 'http-validation' }, (value) =>
        compileHttpValidationMiddleware(value, route),
      )
      .with({ kind: 'generic-layer' }, (value) => value)
      .exhaustive(),
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
  return patternMatch(middleware)
    .with({ part: 'body' }, () => {
      const schema = route.request?.body
      if (!schema) {
        throw new TypeError(
          `HTTP ${route.method} ${route.path} uses validate.body but declares no request body.`,
        )
      }
      return createBodyValidationMiddleware(schema)
    })
    .exhaustive()
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
