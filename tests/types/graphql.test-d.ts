import { parse, type GraphQLError, type GraphQLFormattedError } from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import {
  graphql,
  ConnectionRejected,
  type GraphQLWebSocketHooks,
  type GraphQLConnectionInitHandler,
} from '@loutrejs/graphql'
import {
  defineApplication,
  defineModule,
  createKernelApplication,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { websocket } from '@loutrejs/loutre/websocket'

const manifest = bindManifest({
  schemaDocument: parse('type Query { hello: String }'),
  resolvers: { Query: { hello: () => 'Hello' } },
})
const factory = () => ({ context: () => ({}) })
const httpOnly = graphql.endpoint({
  name: 'Http',
  path: '/graphql',
  manifest,
  factory,
})
const websocketOnly = graphql.endpoint({
  name: 'WebSocket',
  http: false,
  path: '/graphql',
  manifest,
  ws: true,
  factory,
})
const both = graphql.endpoint({
  name: 'Both',
  path: '/graphql',
  manifest,
  http: true,
  ws: true,
  factory: () => ({
    ws: {
      connectionInit({ request, signal, payload }) {
        const openingRequest: Request = request
        const connectionSignal: AbortSignal = signal
        const params: Readonly<Record<string, unknown>> | undefined = payload
        void [openingRequest, connectionSignal, params]
        return { ready: true }
      },
      onDisconnect(connection, code, reason) {
        const request: Request = connection.extra.request
        const status: number | undefined = code
        const message: string | undefined = reason
        void [request, status, message]
      },
      async onClose(connection) {
        const signal: AbortSignal = connection.extra.signal
        void signal
      },
    },
    formatError(error, input) {
      const typedError: GraphQLError = error
      const request: Request = input.request
      if (input.transport === 'websocket') {
        const id: string = input.operationId
        void id
      } else {
        const state: Readonly<Record<string, unknown>> = input.state
        void state
      }
      const formatted: GraphQLFormattedError = {
        message: typedError.message,
        extensions: { code: 'APP_ERROR' },
      }
      void request
      return formatted
    },
    context(input) {
      const request: Request = input.request
      const signal: AbortSignal = input.signal
      if (input.transport === 'websocket') {
        const id: string = input.operationId
        void id
      } else {
        const state: Readonly<Record<string, unknown>> = input.state
        void state
        // @ts-expect-error HTTP contextにはclient operation IDを公開しない
        input.operationId
      }
      return { request, signal }
    },
  }),
})
const HttpModule = defineModule(() => ({ executions: [httpOnly] }))
const WsModule = defineModule(() => ({ executions: [websocketOnly] }))
const BothModule = defineModule(() => ({ executions: [both] }))
const httpApp = createKernelApplication({
  application: defineApplication({ modules: [HttpModule()] }),
})
httpApp.http.fetch(new Request('http://test'))
// @ts-expect-error HTTPのみのendpointにWebSocket hostを公開しない
httpApp.websocket
const wsApp = createKernelApplication({
  application: defineApplication({ modules: [WsModule()] }),
})
wsApp.websocket.upgrade(new Request('http://test'))
// @ts-expect-error WebSocketのみのendpointにHTTP hostを公開しない
wsApp.http
const bothApp = createKernelApplication({
  application: defineApplication({ modules: [BothModule()] }),
})
bothApp.http.fetch(new Request('http://test'))
bothApp.websocket.upgrade(new Request('http://test'))

http.raw({
  route: { method: '*', path: '/raw' },
  factory: () => async (context) => {
    const request: Request = context.request
    return new Response(await request.text())
  },
})
http.raw({
  route: { method: '*', path: '/raw' },
  // @ts-expect-error raw handlerはResponseを返す
  factory: () => async () => ({
    kind: 'http-result',
    response: 'ok',
    body: undefined,
  }),
})
const invalidWebSocketRoute = {
  path: '/socket',
  responses: { ok: { status: 200 } },
}
// @ts-expect-error WebSocket v2はHTTP response contractを持たない
websocket.contract({ route: invalidWebSocketRoute })

// @ts-expect-error factoryは必須
graphql.endpoint({ name: 'MissingFactory', path: '/graphql', manifest })
graphql.endpoint({
  name: 'MissingContext',
  path: '/graphql',
  manifest,
  // @ts-expect-error contextは必須
  factory: () => ({}),
})
graphql.endpoint({
  name: 'Legacy',
  path: '/graphql',
  manifest,
  // @ts-expect-error rootValueを返すfactoryは拒否する
  factory: () => ({ context: () => ({}), rootValue: {} }),
})
graphql.endpoint({
  name: 'AsyncFormatter',
  path: '/graphql',
  manifest,
  factory: () => ({
    context: () => ({}),
    // @ts-expect-error formatErrorは同期的なGraphQLFormattedErrorを返す
    formatError: async () => ({ message: 'error' }),
  }),
})
graphql.endpoint({
  name: 'MissingMessage',
  path: '/graphql',
  manifest,
  factory: () => ({
    context: () => ({}),
    // @ts-expect-error 整形済みエラーにはmessageが必要
    formatError: () => ({ extensions: {} }),
  }),
})

const protectedHooks: GraphQLWebSocketHooks = {
  // @ts-expect-error manifestのexecuteは公開フックから上書きできない
  execute: () => ({ data: {} }),
}
const operationHooks: GraphQLWebSocketHooks = {
  // @ts-expect-error operationのleaseを所有するonSubscribeは公開しない
  onSubscribe: () => undefined,
}
const invalidHooks: GraphQLWebSocketHooks = {
  // @ts-expect-error 接続開始の入口はconnectionInitへ一本化する
  onConnect: () => true,
}
void [protectedHooks, operationHooks, invalidHooks]

const userState = http.middleware<{ currentUser: { readonly id: string } }>({
  name: '利用者',
  factory: () => async (_context, next) =>
    next({ currentUser: { id: 'user-1' } }),
})
const tenantState = http.middleware<{ tenantId: string }>({
  name: '組織',
  factory: () => async (_context, next) => next({ tenantId: 'tenant-1' }),
})
graphql.endpoint({
  name: '型付きmiddleware state',
  path: '/typed',
  manifest,
  http: { middlewares: [userState, tenantState] },
  ws: true,
  factory: () => ({
    context(input) {
      if (input.transport === 'http') {
        const id: string = input.state.currentUser.id
        const tenant: string = input.state.tenantId
        // @ts-expect-error middlewareが提供しないstateは存在しない
        input.state.missing
        // @ts-expect-error middleware stateは読み取り専用
        input.state.tenantId = 'other'
        void [id, tenant]
      } else {
        // @ts-expect-error WSへHTTP middleware stateを持ち込まない
        input.state.currentUser
      }
      return {}
    },
    formatError(error, input) {
      if (input.transport === 'http') {
        const id: string = input.state.currentUser.id
        void id
      }
      return error.toJSON()
    },
  }),
})

graphql.endpoint({
  name: '入口ごとのstate',
  path: '/profile',
  manifest,
  http: { middlewares: [userState, tenantState] },
  ws: true,
  factory: () => ({
    ws: {
      connectionInit: async ({ request, signal, payload }) => {
        const openingRequest: Request = request
        const connectionSignal: AbortSignal = signal
        const params: Readonly<Record<string, unknown>> | undefined = payload
        void [openingRequest, connectionSignal, params]
        if (payload?.authorization === undefined)
          return new ConnectionRejected('認証が必要です。')
        return { currentUser: { id: 'user-1' } }
      },
    },
    context(input) {
      const id: string = input.state.currentUser.id
      // @ts-expect-error stateは読み取り専用
      input.state.currentUser = { id: 'other' }
      if (input.transport === 'http') {
        const tenant: string = input.state.tenantId
        void tenant
      } else {
        // @ts-expect-error HTTPのstateをWSへ渡さない
        input.state.tenantId
      }
      void id
      return {}
    },
    formatError(error, input) {
      const id: string = input.state.currentUser.id
      void id
      return error.toJSON()
    },
  }),
})
graphql.endpoint({
  name: 'WSのみのstate',
  http: false,
  path: '/ws',
  manifest,
  ws: true,
  factory: () => ({
    ws: {
      connectionInit: async ({ request, signal, payload }) => {
        const openingRequest: Request = request
        const connectionSignal: AbortSignal = signal
        const params: Readonly<Record<string, unknown>> | undefined = payload
        void [openingRequest, connectionSignal, params]
        if (payload?.authorization === undefined)
          return new ConnectionRejected('認証が必要です。')
        return { currentUser: { id: 'user-1' } }
      },
    },
    context(input) {
      const id: string = input.state.currentUser.id
      const operationId: string = input.operationId
      // @ts-expect-error WSのみの入力をHTTPとして扱わない
      const transport: 'http' = input.transport
      void [id, operationId, transport]
      return {}
    },
  }),
})
graphql.endpoint({
  name: 'HTTPのみのstate',
  path: '/http',
  manifest,
  http: { middlewares: [userState] },
  factory: () => ({
    context(input) {
      const id: string = input.state.currentUser.id
      // @ts-expect-error HTTPのみの入力にWSのoperation IDは存在しない
      input.operationId
      void id
      return {}
    },
  }),
})

graphql.endpoint({
  name: '非同期ConnectionInitのstate',
  path: '/async',
  manifest,
  http: false,
  ws: true,
  factory: () => ({
    ws: {
      connectionInit: async () => {
        const tenantId = await Promise.resolve('tenant-1')
        return { tenantId }
      },
      onClose({ extra }) {
        const state: Readonly<{ tenantId: string }> | undefined = extra.state
        // @ts-expect-error 接続stateは読み取り専用
        if (state) state.tenantId = 'other'
      },
    },
    context: ({ state }) => {
      const id: string = state.tenantId
      // @ts-expect-error ConnectionInitが提供しないstateは存在しない
      state.currentUser
      // @ts-expect-error ConnectionInitのstateは読み取り専用
      state.tenantId = 'other'
      return { id }
    },
  }),
})

graphql.endpoint({
  name: 'WS設定でHTTPを無効にしない',
  path: '/both',
  manifest,
  ws: true,
  factory: () => ({
    context(input) {
      const transport: 'http' | 'websocket' = input.transport
      return { transport }
    },
  }),
})
const defaultHttpWithWs = graphql.endpoint({
  name: '既定HTTPとWS',
  path: '/both',
  manifest,
  ws: true,
  factory,
})
const DefaultModule = defineModule(() => ({ executions: [defaultHttpWithWs] }))
const defaultApp = createKernelApplication({
  application: defineApplication({ modules: [DefaultModule()] }),
})
defaultApp.http.fetch(new Request('http://test'))
defaultApp.websocket.upgrade(new Request('http://test'))

graphql.endpoint({
  name: 'WS有効化の指定忘れ',
  path: '/missing',
  manifest,
  factory: () => ({
    context: () => ({}),
    // @ts-expect-error WSの有効化なしにhandlerを指定しない
    ws: { connectionInit: () => ({ currentUser: { id: '1' } }) },
  }),
})
graphql.endpoint({
  name: 'WSを明示的に無効化',
  path: '/disabled',
  manifest,
  ws: false,
  factory: () => ({
    context: () => ({}),
    // @ts-expect-error 無効なWSへhandlerを指定しない
    ws: { onClose() {} },
  }),
})
graphql.endpoint({
  name: 'HTTP ResponseをWSで返さない',
  path: '/response',
  manifest,
  ws: true,
  factory: () => ({
    context: () => ({}),
    ws: {
      // @ts-expect-error WSの拒否はConnectionRejectedで表す
      connectionInit: () => new Response(null, { status: 401 }),
    },
  }),
})
graphql.endpoint({
  name: '戻り値を忘れない',
  path: '/void',
  manifest,
  ws: true,
  factory: () => ({
    context: () => ({}),
    ws: {
      // @ts-expect-error stateかConnectionRejectedを返す
      connectionInit: async () => {},
    },
  }),
})

const responseHandler: GraphQLConnectionInitHandler = () =>
  // @ts-expect-error 公開handler型もHTTP Responseを受け付けない
  new Response(null, { status: 401 })
// @ts-expect-error 公開handler型も戻り値の省略を受け付けない
const emptyHandler: GraphQLConnectionInitHandler = async () => {}
// @ts-expect-error 公開handler型も配列を受け付けない
const arrayHandler: GraphQLConnectionInitHandler = () => []
const responseHooks: GraphQLWebSocketHooks = {
  // @ts-expect-error 公開hook型もHTTP Responseを受け付けない
  connectionInit: () => new Response(),
}
interface AuthenticationState {
  readonly currentUser: { readonly id: string }
}
const annotatedHandler: GraphQLConnectionInitHandler<
  AuthenticationState
> = async () => {
  const state: AuthenticationState = { currentUser: { id: '1' } }
  return state
}
void [
  responseHandler,
  emptyHandler,
  arrayHandler,
  responseHooks,
  annotatedHandler,
]

const rejection = new ConnectionRejected('認証が必要です。')
const publicReason: string = rejection.reason
// @ts-expect-error 公開する理由は読み取り専用
rejection.reason = '変更'
void publicReason
graphql.endpoint({
  name: 'booleanで拒否しない',
  path: '/boolean',
  manifest,
  ws: true,
  factory: () => ({
    context: () => ({}),
    ws: {
      // @ts-expect-error booleanの代わりにConnectionRejectedを返す
      connectionInit: () => false,
    },
  }),
})
