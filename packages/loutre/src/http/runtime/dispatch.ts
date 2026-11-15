import {
  type ExecutionRuntimeBinding,
  type ExecutionKernelRuntime,
  SchemaValidationError,
  composeLayers,
} from '../../core/index.js'
import { type CompiledHttpExecution } from '../compiled.js'
import { IngressGate } from '../../runtime/ingress-gate.js'
import {
  type ActiveHttpResponseStream,
  type RuntimeHttpHandlers,
  type RuntimeHttpRoute,
  type HttpResponseStreamControl,
  type InitialHttpContext,
} from './types.js'
import { match as patternMatch } from 'ts-pattern'
import { createRawHttpHandlers, createHttpHandlers } from './handler.js'
import {
  compareHttpPathSpecificity,
  HttpPathDecodeError,
  matchHttpPath,
} from '../path.js'
import { expiresAt, epochNow } from '../../core/units.js'
import {
  createCorsPreflightResponseHeaders,
  createCorsActualResponseHeaders,
} from '../cors-internal.js'
import { syntheticExecutionId } from '../../core/identity.js'
import { applyFrameworkHeadersToResponse } from '../codecs/response.js'
import { createHttpContext, replayHttpHandler } from './context.js'
import {
  HttpUnsupportedMediaTypeError,
  HttpInputDecodeError,
  HttpInputValidationError,
} from '../codecs/request.js'
import {
  type HttpMiddlewareOutcome,
  type HttpExtensionRuntime,
  type AnyHttpMiddleware,
} from '../contract.js'
import { createLeasedReadableStream } from './stream.js'
import { finalizeHttpResult, mapDeclaredError } from './response.js'
import { requestPathname } from '../identity.js'

export function createHttpExtensionRuntime(
  bindings: readonly ExecutionRuntimeBinding<CompiledHttpExecution>[],
  applicationRuntime: ExecutionKernelRuntime,
): HttpExtensionRuntime {
  const ingress = new IngressGate()
  const activeResponseStreams = new Set<ActiveHttpResponseStream>()
  const handlers = new Map<string, RuntimeHttpHandlers>()
  for (const binding of bindings) {
    const { compiled } = binding.execution
    const resolveHandler = compiled.handler.createResolver(binding)
    handlers.set(
      binding.execution.id,
      patternMatch(compiled)
        .with({ kind: 'raw' }, () => createRawHttpHandlers(resolveHandler))
        .with({ kind: 'contract' }, ({ routes }) =>
          createHttpHandlers(
            resolveHandler(),
            routes.map((route) => route.name),
          ),
        )
        .exhaustive(),
    )
  }
  const routes = bindings
    .flatMap(({ execution, resolve }) =>
      execution.compiled.routes.map((route): RuntimeHttpRoute => ({
        executionId: execution.id,
        route,
        resolve,
      })),
    )
    .toSorted((left, right) =>
      compareHttpPathSpecificity(left.route.segments, right.route.segments),
    )

  return {
    async drain({ timeoutMs }) {
      ingress.stopAccepting()
      const deadline = expiresAt(epochNow(), timeoutMs)
      await ingress.waitForIdle()
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
      if (!ingress.isAccepting) {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      if (
        request.headers.has('upgrade') ||
        request.headers
          .get('connection')
          ?.split(',')
          .some((value) => value.trim().toLowerCase() === 'upgrade')
      ) {
        return new Response(
          'Upgrade requests must use the WebSocket entry point.',
          { status: 400 },
        )
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
            const completePendingIngress = ingress.enter()
            if (!completePendingIngress) {
              return Response.json(
                { error: 'Service Unavailable' },
                { status: 503 },
              )
            }
            let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
            try {
              lease = applicationRuntime.beginExecution({
                executionId: match.executionId,
                executionKind: 'http.request',
                graphNodeId: match.executionId,
                name: `OPTIONS ${match.route.path}`,
              })
            } catch (error) {
              completePendingIngress()
              throw error
            }
            try {
              const headers = await createCorsPreflightResponseHeaders(
                match.route.middlewares,
                request,
                match.route.method,
              )
              if (headers) {
                lease.annotate?.({ 'http.status_code': 204 })
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
        const completePendingIngress = ingress.enter()
        if (!completePendingIngress) {
          return Response.json(
            { error: 'Service Unavailable' },
            { status: 503 },
          )
        }
        let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
        try {
          lease = applicationRuntime.beginExecution({
            executionId: syntheticExecutionId('http.not-found'),
            executionKind: 'http.request',
            name: `${method} ${url.pathname}`,
          })
        } catch (error) {
          completePendingIngress()
          throw error
        }
        try {
          lease.annotate?.({ 'http.status_code': 404 })
          return Response.json({ error: 'Not Found' }, { status: 404 })
        } finally {
          lease.complete()
          completePendingIngress()
        }
      }

      const completePendingIngress = ingress.enter()
      if (!completePendingIngress) {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
      try {
        lease = applicationRuntime.beginExecution({
          executionId: match.executionId,
          executionKind: 'http.request',
          graphNodeId: match.executionId,
          name: `${match.route.method} ${match.route.path}`,
        })
      } catch (error) {
        completePendingIngress()
        throw error
      }
      const abortRequest = () => lease.abort(request.signal.reason)
      let executionOwnedByStream = false
      let executionFinished = false
      let executionResult: unknown
      let hasExecutionResult = false
      const finishExecution = () => {
        if (executionFinished) return
        executionFinished = true
        request.signal.removeEventListener('abort', abortRequest)
        if (hasExecutionResult) lease.complete(executionResult)
        else lease.complete()
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
      const annotateResponse = <TResponse extends Response>(
        response: TResponse,
      ): TResponse => {
        lease.annotate?.({ 'http.status_code': response.status })
        return response
      }
      try {
        const corsHeaders = await createCorsActualResponseHeaders(
          match.route.middlewares,
          request,
        )
        const complete = (response: Response): Response =>
          annotateResponse(
            applyFrameworkHeadersToResponse(response, corsHeaders),
          )

        let context: InitialHttpContext
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
        const dispatch = () =>
          composeLayers({
            context,
            layers: match.route.middlewares,
            resolve: match.resolve,
            terminal: async (middlewareContext) => {
              const handlerName = `${match.executionId}.${match.route.name}`
              const handlerOperation = applicationRuntime.beginOperation?.(
                {
                  kind: 'http.handler',
                  name: handlerName,
                  graphNodeId: match.executionId,
                },
                patternMatch(match.route)
                  .with({ kind: 'raw' }, () => undefined)
                  .with({ kind: 'contract' }, (route) => ({
                    input: middlewareContext.input,
                    invoke: (input: unknown) =>
                      replayHttpHandler(
                        applicationRuntime,
                        handler,
                        { ...match, route },
                        input,
                        middlewareContext.state,
                      ),
                  }))
                  .exhaustive(),
              )
              const invoke = () =>
                patternMatch(match.route.kind)
                  .with('contract', () =>
                    handler({
                      kind: 'contract',
                      input: middlewareContext.input,
                      response: middlewareContext.response,
                      signal: middlewareContext.signal,
                      state: middlewareContext.state,
                    }),
                  )
                  .with('raw', () =>
                    handler({
                      kind: 'raw',
                      request,
                      signal: middlewareContext.signal,
                      state: middlewareContext.state,
                      execution: {
                        signal: lease.signal,
                        annotate: (attributes) => lease.annotate?.(attributes),
                        beginOperation: (metadata) => {
                          const begin = () =>
                            applicationRuntime.beginOperation?.(metadata) ?? {
                              complete() {},
                            }
                          return lease.run ? lease.run(begin) : begin()
                        },
                      },
                    }),
                  )
                  .exhaustive()
              let result: HttpMiddlewareOutcome | undefined
              let hasResult = false
              try {
                result = await (handlerOperation?.run
                  ? handlerOperation.run(invoke)
                  : invoke())
                hasResult = true
                return result
              } catch (error) {
                handlerOperation?.fail?.(error)
                throw error
              } finally {
                if (hasResult) handlerOperation?.complete(result)
                else handlerOperation?.complete()
              }
            },
          })
        const result = await (lease.run ? lease.run(dispatch) : dispatch())
        executionResult = result
        hasExecutionResult = true
        if (result instanceof Response) {
          if (result.body) {
            const stream = createLeasedReadableStream(
              result.body,
              lease.signal,
              finishExecution,
            )
            adoptResponseStream(stream)
            return complete(
              new Response(stream.stream, {
                status: result.status,
                statusText: result.statusText,
                headers: result.headers,
              }),
            )
          }
          return complete(result)
        }
        if (match.route.kind === 'raw')
          throw new TypeError(
            'Raw handlers and middleware must return a Response.',
          )
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
          return annotateResponse(
            applyFrameworkHeadersToResponse(
              Response.json({ error: 'Invalid request' }, { status: 400 }),
              await safeCorsHeaders(match.route.middlewares, request),
            ),
          )
        }
        if (error instanceof HttpInputValidationError) {
          return annotateResponse(
            applyFrameworkHeadersToResponse(
              Response.json({ error: 'Validation failed' }, { status: 400 }),
              await safeCorsHeaders(match.route.middlewares, request),
            ),
          )
        }
        lease.fail?.(error)
        try {
          const response = await patternMatch(match.route)
            .with({ kind: 'raw' }, () => undefined)
            .with({ kind: 'contract' }, async ({ definition }) => {
              const mapped = await mapDeclaredError(definition, error)
              if (!mapped) return undefined
              const finalized = await finalizeHttpResult(
                definition,
                mapped,
                lease.signal,
                finishExecution,
              )
              if (finalized.streamControl)
                adoptResponseStream(finalized.streamControl)
              return finalized.response
            })
            .exhaustive()
          if (response)
            return annotateResponse(
              applyFrameworkHeadersToResponse(
                response,
                await safeCorsHeaders(match.route.middlewares, request),
              ),
            )
        } catch {
          // 内部のmapping/finalization errorをclientへ公開しない。
        }
        return annotateResponse(
          applyFrameworkHeadersToResponse(
            Response.json({ error: 'Internal Server Error' }, { status: 500 }),
            await safeCorsHeaders(match.route.middlewares, request),
          ),
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
    if (candidate.route.method !== method && candidate.route.method !== '*')
      continue
    const params = matchHttpPath(
      candidate.route.segments,
      requestPathname(pathname),
    )
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
