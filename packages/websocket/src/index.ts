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
} from '@loutrejs/loutre'
import type {
  HttpExecutionRequestDefinition,
  HttpExecutionResponseDefinition,
} from '@loutrejs/http'
import {
  matchHttpPath,
  normalizeHttpPath,
  parseHttpPath,
  type HttpPathSegment,
} from '@loutrejs/http'

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

export type WebSocketHandlerContext<
  TRoute extends WebSocketRouteDefinition = WebSocketRouteDefinition,
> = {
  readonly input: {
    readonly params: Readonly<Record<string, unknown>>
    readonly query: unknown
    readonly headers: unknown
  } & IncomingApi<TRoute>
  readonly signal: AbortSignal
  readonly closed: Promise<WebSocketCloseInfo>
  close(code?: number, reason?: string): Promise<void>
} & SendApi<TRoute>

export type WebSocketHandlers<TContract extends WebSocketContract> = {
  readonly [
    TName in keyof TContract['routes'] as TContract['routes'][TName] extends WebSocketRouteDefinition
      ? TName
      : never
  ]: TContract['routes'][TName] extends WebSocketRouteDefinition
    ? (
        context: WebSocketHandlerContext<TContract['routes'][TName]>,
      ) => void | Promise<void>
    : never
}

export interface WebSocketImplementationDefinition<
  TContract extends WebSocketContract = WebSocketContract,
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly name: string
  readonly contract: TContract
  readonly inject: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => WebSocketHandlers<TContract>
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
  readonly inject: readonly TokenLike[]
  readonly factory: WebSocketImplementationDefinition['factory']
}

interface ActiveSession {
  readonly close: (code: number, reason: string) => Promise<void>
  readonly terminate: () => void | Promise<void>
}

export interface WebSocketExtensionRuntime {
  upgrade(request: Request): Promise<Response>
  drain(): Promise<void>
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
  name: '@loutrejs/websocket',
  compile(definition, context) {
    return {
      kind: 'execution',
      id:
        definition.name ||
        `${context.moduleId}.websocket.${context.definitionIndex}`,
      executionKind: 'websocket.session',
      extension: definition.extension,
      dependencies: definition.inject,
      capabilities: [WEBSOCKET_SERVER],
      compiled: {
        routes: compileRouteTree(definition.contract.routes),
        inject: definition.inject,
        factory: definition.factory,
      },
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
  project: ({ execution }) => ({
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
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> = WebSocketImplementationDefinition<TContract, TInject> &
  ExecutionDefinition<typeof websocketExtension>

export function defineWebSocketContract<
  const TRoutes extends WebSocketRouteTree,
>(routes: TRoutes): WebSocketContract<TRoutes> {
  return Object.freeze({ kind: 'websocket-contract', routes })
}

export function defineWebSocketImplementation<
  const TContract extends WebSocketContract,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly inject?: TInject
  readonly factory: WebSocketImplementationDefinition<
    TContract,
    TInject
  >['factory']
}): WebSocketExecutionDefinition<TContract, TInject> {
  return defineExecution(websocketExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    inject: definition.inject ?? ([] as unknown as TInject),
    factory: definition.factory,
  }) as WebSocketExecutionDefinition<TContract, TInject>
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
): readonly CompiledWebSocketRoute[] {
  return Object.entries(tree).flatMap(([name, node]) => {
    if (isBranch(node)) {
      return compileRouteTree(
        node.routes,
        joinPath(parentPath, node.path ?? ''),
        { ...parentResponses, ...node.responses },
        prefix ? `${prefix}.${name}` : name,
      )
    }
    const path = joinPath(parentPath, node.path)
    const segments = parseHttpPath(path)
    return [
      Object.freeze({
        name: prefix ? `${prefix}.${name}` : name,
        path,
        normalizedPath: normalizeHttpPath(segments),
        segments,
        ...(node.request === undefined ? {} : { request: node.request }),
        responses: Object.freeze({
          ...parentResponses,
          ...node.responses,
        }),
        ...(node.messages === undefined ? {} : { messages: node.messages }),
      }),
    ]
  })
}

function isBranch(
  node: WebSocketRouteDefinition | WebSocketBranchDefinition,
): node is WebSocketBranchDefinition {
  return 'routes' in node
}

function joinPath(parent: string, child: string): string {
  const joined = `${parent}/${child}`.replaceAll(/\/{2,}/g, '/')
  return joined === '' ? '/' : joined.startsWith('/') ? joined : `/${joined}`
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
            id: `websocket:${execution.id}`,
            name: execution.id,
          },
          resolve: (token) => applicationRuntime.resolve(token),
        },
        () => execution.compiled.factory(...dependencies) as never,
      ),
    )
  }
  return {
    async upgrade(request) {
      if (state !== 'running') {
        return Response.json({ error: 'Service Unavailable' }, { status: 503 })
      }
      const match = findRoute(executions, request)
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
      const lease = applicationRuntime.beginExecution()
      let upgraded: WebSocketUpgradeResult
      try {
        upgraded = await driver.upgrade(request)
      } catch (error) {
        lease.complete()
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
      void session.completion.finally(() => sessions.delete(session.active))
      return upgraded.response
    },
    async drain() {
      if (state !== 'running') return
      state = 'draining'
      await Promise.all(
        [...sessions].map(async (session) => {
          const graceful = session
            .close(1001, 'Going Away')
            .then(() => true)
            .catch(() => false)
          const completed = await Promise.race([
            graceful,
            delay(5_000).then(() => false),
          ])
          if (!completed) await session.terminate()
        }),
      )
    },
    close() {
      state = 'stopped'
    },
  }
}

function findRoute(
  executions: readonly {
    readonly id: string
    readonly compiled: CompiledWebSocketExecution
  }[],
  request: Request,
):
  | {
      readonly executionId: string
      readonly route: CompiledWebSocketRoute
      readonly params: Readonly<Record<string, string>>
    }
  | undefined {
  const url = new URL(request.url)
  for (const execution of executions) {
    for (const route of execution.compiled.routes) {
      const params = matchHttpPath(route.segments, url.pathname)
      if (params) return { executionId: execution.id, route, params }
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
  const query = route.request?.query
    ? await validateSchema(
        route.request.query,
        Object.fromEntries(url.searchParams),
      )
    : url.searchParams
  const headers = route.request?.headers
    ? await validateSchema(
        route.request.headers,
        Object.fromEntries(request.headers),
      )
    : request.headers
  return { params, query, headers }
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
  const closed = connection.closed.then((info) => {
    state = 'closed'
    lease.abort(info)
    return normalizeCloseInfo(info)
  })
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
      await closed
      lease.complete()
    }
  })()
  return {
    active: { close, terminate: () => connection.terminate() },
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
      yield { isValid: true, value: await validateSchema(codec.input, decoded) }
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class WebSocketMessageDecodeError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket message could not be decoded.', { cause })
    this.name = 'WebSocketMessageDecodeError'
  }
}

export class WebSocketMessageEncodeError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket message could not be encoded.', { cause })
    this.name = 'WebSocketMessageEncodeError'
  }
}

export class WebSocketConnectionNotOpenError extends Error {
  constructor(cause?: unknown) {
    super('WebSocket connection is not open.', { cause })
    this.name = 'WebSocketConnectionNotOpenError'
  }
}
