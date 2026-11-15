import { type ExecutionNodeId } from '../../core/model/identity.js'
import {
  type DependencyResolver,
  type ExecutionRuntimeBinding,
  type ExecutionKernelRuntime,
  composeLayers,
} from '../../core/index.js'
import {
  type CompiledWebSocketRoute,
  type CompiledWebSocketExecution,
} from '../compiled.js'
import {
  type WebSocketServerDriver,
  type WebSocketUpgradeResult,
  type WebSocketExtensionRuntime,
} from '../contract.js'
import { type ActiveSession, createSession } from './session.js'
import { IngressGate } from '../../runtime/ingress-gate.js'
import {
  compareHttpPathSpecificity,
  HttpPathDecodeError,
  matchHttpPath,
} from '../../http/path.js'
import { validateOpeningRequest } from './handshake.js'
import { requestPathname } from '../../http/identity.js'
import { type DurationMs, milliseconds } from '../../core/units.js'

interface RuntimeWebSocketRoute {
  readonly executionId: ExecutionNodeId
  readonly resolve: DependencyResolver
  readonly route: CompiledWebSocketRoute
}

export function createWebSocketRuntime(
  bindings: readonly ExecutionRuntimeBinding<CompiledWebSocketExecution>[],
  driver: WebSocketServerDriver,
  applicationRuntime: ExecutionKernelRuntime,
): WebSocketExtensionRuntime {
  const handlerResolvers = new Map<ExecutionNodeId, () => unknown>()
  const sessions = new Set<ActiveSession>()
  let status: 'running' | 'draining' | 'stopped' = 'running'
  const ingress = new IngressGate()
  for (const binding of bindings) {
    handlerResolvers.set(
      binding.execution.id,
      binding.execution.compiled.handler.createResolver(binding),
    )
  }
  const routes = bindings
    .flatMap(({ execution, resolve }) =>
      execution.compiled.routes.map((route): RuntimeWebSocketRoute => ({
        executionId: execution.id,
        resolve,
        route,
      })),
    )
    .toSorted((left, right) =>
      compareHttpPathSpecificity(left.route.segments, right.route.segments),
    )
  return {
    async upgrade(request) {
      if (status !== 'running') {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      if (request.method !== 'GET') {
        return new Response('WebSocket handshake requires GET.', {
          status: 405,
          headers: { allow: 'GET' },
        })
      }
      let match: ReturnType<typeof findRoute>
      try {
        match = findRoute(routes, request)
      } catch (error) {
        if (error instanceof HttpPathDecodeError) {
          return Response.json({ error: 'Invalid request' }, { status: 400 })
        }
        throw error
      }
      if (!match) {
        return Response.json({ error: 'Not Found' }, { status: 404 })
      }
      let input: Awaited<ReturnType<typeof validateOpeningRequest>>
      try {
        input = await validateOpeningRequest(request, match.params, match.route)
      } catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 })
      }
      if (status !== 'running') {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      const offered = (request.headers.get('sec-websocket-protocol') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const protocol = match.route.handshake?.protocols?.find((value) =>
        offered.includes(value),
      )
      if (match.route.handshake?.protocols?.length && protocol === undefined) {
        return new Response('WebSocket subprotocol mismatch.', {
          status: 400,
        })
      }
      const completePendingIngress = ingress.enter()
      if (!completePendingIngress) {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
      try {
        lease = applicationRuntime.beginExecution({
          executionId: match.executionId,
          executionKind: 'websocket.session',
          graphNodeId: match.executionId,
          name: `WS ${match.route.path}`,
        })
      } catch (error) {
        completePendingIngress()
        throw error
      }
      let upgraded: WebSocketUpgradeResult | undefined
      let handshakeState: Readonly<Record<string, unknown>> = {}
      const signal = AbortSignal.any([request.signal, lease.signal])
      try {
        const dispatch = () =>
          composeLayers({
            context: { request, input: { ...input, body: undefined }, signal },
            layers: match.route.handshake?.middlewares ?? [],
            resolve: match.resolve,
            terminal: async ({ state: middlewareState }) => {
              signal.throwIfAborted()
              handshakeState = middlewareState
              upgraded = await driver.upgrade(
                request,
                protocol === undefined ? {} : { protocol },
              )
              return upgraded.response
            },
          })
        const response = await (lease.run ? lease.run(dispatch) : dispatch())
        if (!(response instanceof Response))
          throw new TypeError(
            'WebSocket handshake middleware must return a Response.',
          )
        signal.throwIfAborted()
        if (!upgraded) {
          lease.complete()
          completePendingIngress()
          return response
        }
      } catch (error) {
        try {
          await upgraded?.connection.terminate()
        } finally {
          lease.fail?.(error)
          lease.complete()
          completePendingIngress()
        }
        throw error
      }
      const session = createSession(
        upgraded.connection,
        request,
        applicationRuntime,
        match.route,
        input,
        handshakeState,
        lease,
        handlerResolvers.get(match.executionId),
        lease.run,
      )
      sessions.add(session.active)
      void session.completion.then(
        () => sessions.delete(session.active),
        () => sessions.delete(session.active),
      )
      completePendingIngress()
      if (status !== 'running') {
        await session.completion.catch(() => undefined)
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      return upgraded.response
    },
    async drain({ timeoutMs }) {
      if (status === 'stopped') return
      status = 'draining'
      ingress.stopAccepting()
      await ingress.waitForIdle()
      const gracefulTimeoutMs = webSocketGracefulShutdownBudget(timeoutMs)
      const results = await Promise.allSettled(
        [...sessions].map(async (session) => {
          const graceful = session
            .close(1001, 'Going Away')
            .then(() => session.completion)
            .then(() => true)
            .catch(() => false)
          let timer: ReturnType<typeof setTimeout> | undefined
          const completed =
            gracefulTimeoutMs === 0
              ? false
              : await Promise.race([
                  graceful,
                  new Promise<boolean>((resolve) => {
                    timer = setTimeout(() => resolve(false), gracefulTimeoutMs)
                  }),
                ])
          clearTimeout(timer)
          if (!completed) await session.terminate()
          await session.completion.catch(() => undefined)
        }),
      )
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length > 0) {
        throw new AggregateError(errors, 'WebSocket session drain failed.')
      }
    },
    close() {
      status = 'stopped'
    },
  }
}

function findRoute(
  routes: readonly RuntimeWebSocketRoute[],
  request: Request,
):
  | {
      readonly executionId: ExecutionNodeId
      readonly resolve: DependencyResolver
      readonly route: CompiledWebSocketRoute
      readonly params: Readonly<Record<string, string>>
    }
  | undefined {
  const url = new URL(request.url)
  for (const candidate of routes) {
    const params = matchHttpPath(
      candidate.route.segments,
      requestPathname(url.pathname),
    )
    if (params) {
      return {
        executionId: candidate.executionId,
        resolve: candidate.resolve,
        route: candidate.route,
        params,
      }
    }
  }
  return undefined
}

function webSocketGracefulShutdownBudget(timeoutMs: DurationMs): DurationMs {
  if (timeoutMs <= 0) return milliseconds(0)
  return milliseconds(Math.min(5_000, Math.max(0, Math.floor(timeoutMs * 0.8))))
}
