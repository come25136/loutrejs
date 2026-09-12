import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  runtimeCapability,
  runInInjectionContext,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionExtensionDrainContext,
  type ExecutionKernelRuntime,
  type RuntimeCapabilityBinding,
  type SchemaOutput,
  type StandardSchemaV1,
} from '../core/index.js'
import type {
  HttpExecutionRequestDefinition,
  HttpExecutionResponseDefinition,
} from '../http/index.js'
import { IngressGate } from '../runtime/ingress-gate.js'
import {
  WebSocketConnectionNotOpenError,
  WebSocketMessageDecodeError,
  WebSocketMessageEncodeError,
} from './errors.js'
import {
  compareHttpPathSpecificity,
  HttpPathDecodeError,
  matchHttpPath,
  normalizeHttpPath,
  parseHttpPath,
  type HttpPathSegment,
} from '../http/index.js'

export type WebSocketDataMessage =
  | { readonly type: 'text'; readonly data: string }
  | { readonly type: 'binary'; readonly data: Uint8Array }

export interface WebSocketCloseInfo {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
}

export interface WebSocketConnectionDriver {
  readonly messages: AsyncIterable<WebSocketDataMessage>
  readonly closed: Promise<WebSocketCloseInfo>
  send(message: WebSocketDataMessage): Promise<void>
  close(code?: number, reason?: string): Promise<void>
  terminate(): void | Promise<void>
}

export interface WebSocketUpgradeResult {
  readonly response: Response
  readonly connection: WebSocketConnectionDriver
}

export interface WebSocketServerDriver {
  readonly runtime: string
  upgrade(request: Request): Promise<WebSocketUpgradeResult>
}

export const WEBSOCKET_SERVER =
  runtimeCapability<WebSocketServerDriver>('websocket.server')

export type WebSocketCodecKind = 'json' | 'text' | 'binary'

export interface WebSocketMessageCodec<
  TInput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
  TOutput extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> {
  readonly kind: WebSocketCodecKind
  readonly input: TInput
  readonly output: TOutput
}

export type WebSocketIncomingMessage<TValue> =
  | { readonly isValid: true; readonly value: TValue }
  | {
      readonly isValid: false
      readonly raw: unknown
      readonly error: Error
    }

export interface WebSocketBranchDefinition {
  readonly path?: string
  readonly responses?: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly routes: WebSocketRouteTree
}

export interface WebSocketRouteDefinition {
  readonly path: string
  readonly request?: Omit<HttpExecutionRequestDefinition, 'body'>
  readonly responses?: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly messages?: WebSocketMessageCodec
}

export type WebSocketRouteTree = Readonly<
  Record<string, WebSocketRouteDefinition | WebSocketBranchDefinition>
>

export interface WebSocketContract<
  TRoutes extends WebSocketRouteTree = WebSocketRouteTree,
> {
  readonly kind: 'websocket-contract'
  readonly routes: TRoutes
}

type IncomingApi<TRoute extends WebSocketRouteDefinition> =
  TRoute['messages'] extends WebSocketMessageCodec<infer TInput, any>
    ? TInput extends StandardSchemaV1
      ? {
          readonly messages: AsyncIterable<
            WebSocketIncomingMessage<SchemaOutput<TInput>>
          >
        }
      : {}
    : {}

type SendApi<TRoute extends WebSocketRouteDefinition> =
  TRoute['messages'] extends WebSocketMessageCodec<any, infer TOutput>
    ? TOutput extends StandardSchemaV1
      ? { send(value: SchemaOutput<TOutput>): Promise<void> }
      : {}
    : {}

type OpeningRequestInput<TRoute extends WebSocketRouteDefinition> = {
  readonly params: TRoute extends {
    readonly request: {
      readonly params: infer TParams extends Readonly<
        Record<string, StandardSchemaV1>
      >
    }
  }
    ? { readonly [TName in keyof TParams]: SchemaOutput<TParams[TName]> }
    : Readonly<Record<string, string>>
  readonly query: TRoute extends {
    readonly request: { readonly query: infer TQuery extends StandardSchemaV1 }
  }
    ? SchemaOutput<TQuery>
    : Readonly<Record<string, string | string[]>>
  readonly headers: TRoute extends {
    readonly request: {
      readonly headers: infer THeaders extends StandardSchemaV1
    }
  }
    ? SchemaOutput<THeaders>
    : Headers
}

export type WebSocketHandlerContext<
  TRoute extends WebSocketRouteDefinition = WebSocketRouteDefinition,
> = {
  readonly input: OpeningRequestInput<TRoute> & IncomingApi<TRoute>
  readonly signal: AbortSignal
  readonly closed: Promise<WebSocketCloseInfo>
  close(code?: number, reason?: string): Promise<void>
} & SendApi<TRoute>

type UnionToIntersection<TValue> = (
  TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

type WebSocketHandlersForTree<
  TTree extends WebSocketRouteTree,
  TPrefix extends string = '',
> = UnionToIntersection<
  {
    readonly [
      TName in keyof TTree & string
    ]: TTree[TName] extends WebSocketBranchDefinition
      ? WebSocketHandlersForTree<TTree[TName]['routes'], `${TPrefix}${TName}.`>
      : TTree[TName] extends WebSocketRouteDefinition
        ? {
            readonly [THandlerName in `${TPrefix}${TName}`]: (
              context: WebSocketHandlerContext<TTree[TName]>,
            ) => void | Promise<void>
          }
        : never
  }[keyof TTree & string]
>

export type WebSocketHandlers<TContract extends WebSocketContract> =
  WebSocketHandlersForTree<TContract['routes']>

export interface WebSocketImplementationDefinition<
  TContract extends WebSocketContract = WebSocketContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => WebSocketHandlers<TContract>
}

interface CompiledWebSocketRoute {
  readonly name: string
  readonly path: string
  readonly normalizedPath: string
  readonly segments: readonly HttpPathSegment[]
  readonly request?: Omit<HttpExecutionRequestDefinition, 'body'>
  readonly responses: Readonly<Record<string, HttpExecutionResponseDefinition>>
  readonly messages?: WebSocketMessageCodec
}

interface CompiledWebSocketExecution {
  readonly routes: readonly CompiledWebSocketRoute[]
  readonly factory: WebSocketImplementationDefinition['factory']
}

interface ActiveSession {
  readonly close: (code: number, reason: string) => Promise<void>
  readonly terminate: () => void | Promise<void>
  readonly completion: Promise<void>
}

interface RuntimeWebSocketRoute {
  readonly executionId: string
  readonly route: CompiledWebSocketRoute
}

export interface WebSocketExtensionRuntime {
  upgrade(request: Request): Promise<Response>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
  close(): void
}

export interface WebSocketHostApi {
  upgrade(request: Request): Promise<Response>
}

export const websocketExtension = defineExecutionExtension<
  WebSocketImplementationDefinition & ExecutionDefinition,
  CompiledWebSocketExecution,
  'websocket',
  WebSocketHostApi,
  WebSocketExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: 'loutre:websocket',
  compile(definition, context) {
    return {
      kind: 'execution',
      id:
        definition.name ||
        `${context.moduleId}.websocket.${context.definitionIndex}`,
      executionKind: 'websocket.session',
      dependencies: collectInjectedDependencies(
        {
          kind: 'execution',
          id: `websocket:${definition.name || `${context.moduleId}.websocket.${context.definitionIndex}`}`,
          name:
            definition.name ||
            `${context.moduleId}.websocket.${context.definitionIndex}`,
        },
        () => definition.factory(),
      ),
      capabilities: [WEBSOCKET_SERVER],
      compiled: Object.freeze({
        routes: Object.freeze(compileRouteTree(definition.contract.routes)),
        factory: definition.factory,
      }),
    }
  },
  validate({ executions }) {
    const paths = new Map<string, string>()
    return executions.flatMap((execution) =>
      execution.compiled.routes.flatMap((route) => {
        const owner = paths.get(route.normalizedPath)
        if (owner) {
          return [
            {
              code: 'LUTRE_WEBSOCKET_DUPLICATE_ROUTE',
              message: `${route.path} conflicts with ${owner}.`,
              path: execution.id,
            },
          ]
        }
        paths.set(route.normalizedPath, execution.id)
        return []
      }),
    )
  },
  createRuntime(context) {
    return createWebSocketRuntime(
      context.executions,
      context.capabilities.get(WEBSOCKET_SERVER),
      context.applicationRuntime,
    )
  },
  projectGraph: ({ execution }) => ({
    routes: execution.compiled.routes.map((route) => ({
      name: route.name,
      path: route.path,
      ...(route.messages === undefined
        ? {}
        : {
            messages: {
              codec: route.messages.kind,
              input: route.messages.input !== undefined,
              output: route.messages.output !== undefined,
            },
          }),
    })),
  }),
  host: {
    namespace: 'websocket',
    create: ({ runtime }) => ({
      upgrade: (request) => runtime.upgrade(request),
    }),
  },
})

export type WebSocketExecutionDefinition<
  TContract extends WebSocketContract = WebSocketContract,
> = WebSocketImplementationDefinition<TContract> &
  ExecutionDefinition<typeof websocketExtension>

export function defineWebSocketContract<
  const TRoutes extends WebSocketRouteTree,
>(routes: TRoutes): WebSocketContract<TRoutes> {
  return Object.freeze({ kind: 'websocket-contract', routes })
}

export function defineWebSocketImplementation<
  const TContract extends WebSocketContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: WebSocketImplementationDefinition<TContract>['factory']
}): WebSocketExecutionDefinition<TContract> {
  return defineExecution(websocketExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    factory: definition.factory,
  }) as WebSocketExecutionDefinition<TContract>
}

export function bindWebSocketServer(
  driver: WebSocketServerDriver,
): RuntimeCapabilityBinding<WebSocketServerDriver> {
  return { capability: WEBSOCKET_SERVER, value: driver }
}

function defineCodec<
  const TInput extends StandardSchemaV1 | undefined,
  const TOutput extends StandardSchemaV1 | undefined,
>(
  kind: WebSocketCodecKind,
  definition: { readonly input?: TInput; readonly output?: TOutput },
): WebSocketMessageCodec<TInput, TOutput> {
  if (definition.input === undefined && definition.output === undefined) {
    throw new Error(
      'LUTRE_WEBSOCKET_CODEC_EMPTY: input or output must be declared.',
    )
  }
  return Object.freeze({
    kind,
    input: definition.input as TInput,
    output: definition.output as TOutput,
  })
}

export const websocket = Object.freeze({
  contract: defineWebSocketContract,
  implementation: defineWebSocketImplementation,
  json: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('json', definition),
  text: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('text', definition),
  binary: <
    const TInput extends StandardSchemaV1 | undefined = undefined,
    const TOutput extends StandardSchemaV1 | undefined = undefined,
  >(definition: {
    readonly input?: TInput
    readonly output?: TOutput
  }) => defineCodec('binary', definition),
  extension: websocketExtension,
  serverCapability: WEBSOCKET_SERVER,
  bindServer: bindWebSocketServer,
})

function compileRouteTree(
  tree: WebSocketRouteTree,
  parentPath = '',
  parentResponses: Readonly<
    Record<string, HttpExecutionResponseDefinition>
  > = {},
  prefix = '',
  routeNames = new Set<string>(),
): readonly CompiledWebSocketRoute[] {
  return Object.entries(tree).flatMap(([name, node]) => {
    if (isBranch(node)) {
      const branchPath = node.path ?? ''
      if (branchPath !== '') parseHttpPath(branchPath)
      assertNoInheritedResponseCollision(
        name,
        parentResponses,
        node.responses ?? {},
      )
      return compileRouteTree(
        node.routes,
        joinPath(parentPath, branchPath),
        { ...parentResponses, ...node.responses },
        prefix ? `${prefix}.${name}` : name,
        routeNames,
      )
    }
    parseHttpPath(node.path)
    const path = joinPath(parentPath, node.path)
    const segments = parseHttpPath(path)
    assertExactPathParams(path, segments, node.request?.params)
    assertNoInheritedResponseCollision(
      name,
      parentResponses,
      node.responses ?? {},
    )
    const routeName = prefix ? `${prefix}.${name}` : name
    if (routeNames.has(routeName)) {
      throw new TypeError(`Duplicate nested WebSocket route name: ${routeName}`)
    }
    routeNames.add(routeName)
    return [
      Object.freeze({
        name: routeName,
        path,
        normalizedPath: normalizeHttpPath(segments),
        segments,
        ...(node.request === undefined
          ? {}
          : { request: snapshotWebSocketRequest(node.request) }),
        responses: snapshotWebSocketResponses({
          ...parentResponses,
          ...node.responses,
        }),
        ...(node.messages === undefined
          ? {}
          : { messages: Object.freeze({ ...node.messages }) }),
      }),
    ]
  })
}

function assertExactPathParams(
  path: string,
  segments: readonly HttpPathSegment[],
  params: Readonly<Record<string, StandardSchemaV1>> | undefined,
): void {
  if (!params) return
  const pathParams = segments
    .flatMap((segment) => (segment.kind === 'param' ? [segment.name] : []))
    .toSorted()
  const schemaParams = Object.keys(params).toSorted()
  if (
    pathParams.length !== schemaParams.length ||
    pathParams.some((name, index) => name !== schemaParams[index])
  ) {
    throw new TypeError(
      `WebSocket ${path} request params must exactly match path parameters.`,
    )
  }
}

function assertNoInheritedResponseCollision(
  nodeName: string,
  inherited: Readonly<Record<string, HttpExecutionResponseDefinition>>,
  declared: Readonly<Record<string, HttpExecutionResponseDefinition>>,
): void {
  for (const name of Object.keys(declared)) {
    if (name in inherited) {
      throw new TypeError(
        `Duplicate inherited WebSocket response ${name} at ${nodeName}.`,
      )
    }
  }
}

function snapshotWebSocketRequest(
  request: Omit<HttpExecutionRequestDefinition, 'body'>,
): Omit<HttpExecutionRequestDefinition, 'body'> {
  return Object.freeze({
    ...request,
    ...(request.params === undefined
      ? {}
      : { params: Object.freeze({ ...request.params }) }),
  })
}

function snapshotWebSocketResponses(
  responses: Readonly<Record<string, HttpExecutionResponseDefinition>>,
): Readonly<Record<string, HttpExecutionResponseDefinition>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(responses).map(([name, response]) => [
        name,
        Object.freeze({ ...response }),
      ]),
    ),
  )
}

function isBranch(
  node: WebSocketRouteDefinition | WebSocketBranchDefinition,
): node is WebSocketBranchDefinition {
  return 'routes' in node
}

function joinPath(parent: string, child: string): string {
  if (parent === '') return child || '/'
  if (child === '' || child === '/') return parent
  if (parent === '/') return child
  return `${parent}${child}`
}

function createWebSocketRuntime(
  executions: readonly {
    readonly id: string
    readonly compiled: CompiledWebSocketExecution
  }[],
  driver: WebSocketServerDriver,
  applicationRuntime: ExecutionKernelRuntime,
): WebSocketExtensionRuntime {
  const handlers = new Map<
    string,
    Readonly<
      Record<
        string,
        (context: WebSocketHandlerContext<any>) => void | Promise<void>
      >
    >
  >()
  const sessions = new Set<ActiveSession>()
  let state: 'running' | 'draining' | 'stopped' = 'running'
  const ingress = new IngressGate()
  for (const execution of executions) {
    handlers.set(
      execution.id,
      runInInjectionContext(
        {
          consumer: {
            kind: 'execution',
            id: `websocket:${execution.id}`,
            name: execution.id,
          },
          resolve: (token) => applicationRuntime.resolve(token, execution.id),
        },
        () => execution.compiled.factory() as never,
      ),
    )
  }
  const routes = executions
    .flatMap((execution) =>
      execution.compiled.routes.map((route): RuntimeWebSocketRoute => ({
        executionId: execution.id,
        route,
      })),
    )
    .toSorted((left, right) =>
      compareHttpPathSpecificity(left.route.segments, right.route.segments),
    )
  return {
    async upgrade(request) {
      if (state !== 'running') {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
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
      if (state !== 'running') {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      const completePendingIngress = ingress.enter()
      if (!completePendingIngress) {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
      try {
        lease = applicationRuntime.beginExecution()
      } catch (error) {
        completePendingIngress()
        throw error
      }
      let upgraded: WebSocketUpgradeResult
      try {
        upgraded = await driver.upgrade(request)
      } catch (error) {
        lease.complete()
        completePendingIngress()
        throw error
      }
      const session = createSession(
        upgraded.connection,
        match.route,
        input,
        lease,
        handlers.get(match.executionId)?.[match.route.name],
      )
      sessions.add(session.active)
      void session.completion.then(
        () => sessions.delete(session.active),
        () => sessions.delete(session.active),
      )
      completePendingIngress()
      if (state !== 'running') {
        await session.completion.catch(() => undefined)
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      return upgraded.response
    },
    async drain({ timeoutMs }) {
      if (state === 'stopped') return
      state = 'draining'
      ingress.stopAccepting()
      await ingress.waitForIdle()
      const gracefulTimeoutMs = webSocketGracefulShutdownBudget(timeoutMs)
      const results = await Promise.allSettled(
        [...sessions].map(async (session) => {
          const graceful = session
            .close(1001, 'Going Away')
            .then(() => true)
            .catch(() => false)
          const completed =
            gracefulTimeoutMs === 0
              ? false
              : await Promise.race([
                  graceful,
                  delay(gracefulTimeoutMs).then(() => false),
                ])
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
      state = 'stopped'
    },
  }
}

function findRoute(
  routes: readonly RuntimeWebSocketRoute[],
  request: Request,
):
  | {
      readonly executionId: string
      readonly route: CompiledWebSocketRoute
      readonly params: Readonly<Record<string, string>>
    }
  | undefined {
  const url = new URL(request.url)
  for (const candidate of routes) {
    const params = matchHttpPath(candidate.route.segments, url.pathname)
    if (params) {
      return {
        executionId: candidate.executionId,
        route: candidate.route,
        params,
      }
    }
  }
  return undefined
}

async function validateOpeningRequest(
  request: Request,
  rawParams: Readonly<Record<string, string>>,
  route: CompiledWebSocketRoute,
): Promise<{
  readonly params: Readonly<Record<string, unknown>>
  readonly query: unknown
  readonly headers: unknown
}> {
  const params = route.request?.params
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(route.request.params).map(async ([name, schema]) => [
            name,
            await validateSchema(schema, rawParams[name]),
          ]),
        ),
      )
    : rawParams
  const url = new URL(request.url)
  const rawQuery = decodeQuery(url.searchParams)
  const query = route.request?.query
    ? await validateSchema(route.request.query, rawQuery)
    : rawQuery
  const headers = route.request?.headers
    ? await validateSchema(
        route.request.headers,
        Object.fromEntries(request.headers),
      )
    : request.headers
  return { params, query, headers }
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

function createSession(
  connection: WebSocketConnectionDriver,
  route: CompiledWebSocketRoute,
  input: {
    readonly params: Readonly<Record<string, unknown>>
    readonly query: unknown
    readonly headers: unknown
  },
  lease: ReturnType<ExecutionKernelRuntime['beginExecution']>,
  handler:
    | ((context: WebSocketHandlerContext<any>) => void | Promise<void>)
    | undefined,
): { readonly active: ActiveSession; readonly completion: Promise<void> } {
  let state: 'open' | 'closing' | 'closed' = 'open'
  let transportFailed = false
  let sendTail = Promise.resolve()
  let closeOperation: Promise<void> | undefined
  const closed = connection.closed.then(
    (info) => {
      state = 'closed'
      lease.abort(info)
      return normalizeCloseInfo(info)
    },
    (error: unknown) => {
      state = 'closed'
      lease.abort(error)
      throw error
    },
  )
  const close = (code = 1000, reason = ''): Promise<void> => {
    if (closeOperation) return closeOperation
    if (state === 'closed') return closed.then(() => undefined)
    state = 'closing'
    closeOperation = sendTail
      .catch(() => undefined)
      .then(() => connection.close(code, reason))
      .then(() => closed)
      .then(() => undefined)
    return closeOperation
  }
  const send = (value: unknown): Promise<void> => {
    if (state !== 'open' || transportFailed) {
      return Promise.reject(new WebSocketConnectionNotOpenError())
    }
    const operation = sendTail
      .catch(() => undefined)
      .then(async () => {
        if (state !== 'open' || transportFailed) {
          throw new WebSocketConnectionNotOpenError()
        }
        const message = await encodeMessage(route.messages, value)
        try {
          await connection.send(message)
        } catch (error) {
          transportFailed = true
          throw new WebSocketConnectionNotOpenError(error)
        }
      })
    sendTail = operation
    return operation
  }
  const messages = decodeMessages(connection.messages, route.messages)
  const context = {
    input: {
      ...input,
      ...(route.messages?.input === undefined ? {} : { messages }),
    },
    signal: lease.signal,
    closed,
    close,
    ...(route.messages?.output === undefined ? {} : { send }),
  } as WebSocketHandlerContext<any>
  const completion = (async () => {
    try {
      if (!handler) {
        throw new Error(`LUTRE_WEBSOCKET_HANDLER_MISSING: ${route.name}`)
      }
      await handler(context)
      if (state === 'open') await close(1000, '')
    } catch {
      if (state === 'open') await close(1011, '')
    } finally {
      try {
        await closed
      } finally {
        lease.complete()
      }
    }
  })()
  return {
    active: {
      close,
      terminate: () => connection.terminate(),
      completion,
    },
    completion,
  }
}

async function* decodeMessages(
  source: AsyncIterable<WebSocketDataMessage>,
  codec: WebSocketMessageCodec | undefined,
): AsyncIterable<WebSocketIncomingMessage<unknown>> {
  if (!codec?.input) return
  for await (const message of source) {
    let decoded: unknown
    try {
      decoded = decodeMessage(codec.kind, message)
    } catch (error) {
      yield {
        isValid: false,
        raw: message.data,
        error:
          error instanceof WebSocketMessageDecodeError
            ? error
            : new WebSocketMessageDecodeError(error),
      }
      continue
    }
    try {
      yield {
        isValid: true,
        value: await validateSchema(codec.input, decoded),
      }
    } catch (error) {
      yield {
        isValid: false,
        raw: decoded,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}

function decodeMessage(
  kind: WebSocketCodecKind,
  message: WebSocketDataMessage,
): unknown {
  if (kind === 'json') {
    if (message.type !== 'text') throw new WebSocketMessageDecodeError()
    try {
      return JSON.parse(message.data)
    } catch (error) {
      throw new WebSocketMessageDecodeError(error)
    }
  }
  if (kind === 'text') {
    if (message.type !== 'text') throw new WebSocketMessageDecodeError()
    return message.data
  }
  if (message.type !== 'binary') throw new WebSocketMessageDecodeError()
  return message.data
}

async function encodeMessage(
  codec: WebSocketMessageCodec | undefined,
  value: unknown,
): Promise<WebSocketDataMessage> {
  if (!codec?.output) throw new WebSocketMessageEncodeError()
  const output = await validateSchema(codec.output, value)
  try {
    if (codec.kind === 'json') {
      return { type: 'text', data: JSON.stringify(output) }
    }
    if (codec.kind === 'text') {
      if (typeof output !== 'string') throw new TypeError('Expected string')
      return { type: 'text', data: output }
    }
    if (!(output instanceof Uint8Array)) {
      throw new TypeError('Expected Uint8Array')
    }
    return { type: 'binary', data: output }
  } catch (error) {
    throw new WebSocketMessageEncodeError(error)
  }
}

function normalizeCloseInfo(info: WebSocketCloseInfo): WebSocketCloseInfo {
  return {
    code: Number.isInteger(info.code) ? info.code : 1006,
    reason: info.reason ?? '',
    wasClean: info.wasClean === true,
  }
}

function webSocketGracefulShutdownBudget(timeoutMs: number): number {
  if (timeoutMs <= 0) return 0
  return Math.min(5_000, Math.max(0, Math.floor(timeoutMs * 0.8)))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
