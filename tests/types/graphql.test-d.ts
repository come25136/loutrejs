import { parse, type GraphQLError, type GraphQLFormattedError } from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import { graphql, type GraphQLWebSocketHooks } from '@loutrejs/graphql'
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
  path: '/graphql',
  manifest,
  transports: { websocket: true },
  factory,
})
const both = graphql.endpoint({
  name: 'Both',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: () => ({
    websocket: {
      onConnect(connection) {
        const request: Request = connection.extra.request
        const signal: AbortSignal = connection.extra.signal
        const params: Readonly<Record<string, unknown>> | undefined =
          connection.connectionParams
        // @ts-expect-error opening requestの参照は読み取り専用
        connection.extra.request = request
        void [signal, params]
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
  // @ts-expect-error 接続フックは関数を要求する
  onConnect: true,
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
  transports: {
    http: { middlewares: [userState, tenantState] },
    websocket: true,
  },
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
  name: '共通state',
  path: '/state',
  manifest,
  transports: { http: { middlewares: [tenantState] }, websocket: true },
  factory: () => ({
    state: async ({ request, signal, connectionParams }) => {
      const params: Readonly<Record<string, unknown>> | undefined =
        connectionParams
      void [request, signal, params]
      return { currentUser: { id: 'user-1' } }
    },
    context(input) {
      const id: string = input.state.currentUser.id
      // @ts-expect-error 共通stateは読み取り専用
      input.state.currentUser = { id: 'other' }
      if (input.transport === 'http') {
        const tenant: string = input.state.tenantId
        void tenant
      } else {
        // @ts-expect-error HTTPだけのmiddleware stateはWSへ混入しない
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
  name: '前処理の短絡',
  path: '/reject',
  manifest,
  factory: () => ({
    state: ({ request }) =>
      request.headers.has('deny')
        ? new Response(null, { status: 403 })
        : { value: 'ready' },
    context: ({ state }) => {
      const value: string = state.value
      void value
      return {}
    },
  }),
})
