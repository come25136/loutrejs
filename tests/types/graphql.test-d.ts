import { parse, type GraphQLError, type GraphQLFormattedError } from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import {
  graphql,
  type GraphQLWebSocketConnectionInput,
  type GraphQLRuntime,
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
    async onConnect(input) {
      const connection: GraphQLWebSocketConnectionInput = input
      const request: Request = connection.request
      const signal: AbortSignal = connection.signal
      const transport: 'websocket' = connection.transport
      const params: Readonly<Record<string, unknown>> | undefined =
        connection.connectionParams
      // @ts-expect-error 接続入力にはoperation IDを公開しない
      connection.operationId
      // @ts-expect-error 接続入力にはHTTP middleware stateを公開しない
      connection.state
      if (connection.connectionParams) {
        // @ts-expect-error 接続payloadのフィールドは読み取り専用
        connection.connectionParams.authorization = '変更不可'
      }
      void [request, signal, transport, params]
      return { authenticated: true }
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

const acceptConnection: GraphQLRuntime['onConnect'] = () => true
const rejectConnection: GraphQLRuntime['onConnect'] = async () => false
const acceptWithoutPayload: GraphQLRuntime['onConnect'] = () => {}
// @ts-expect-error 接続フックは関数に限定する
const invalidConnectionHook: GraphQLRuntime['onConnect'] = true
// @ts-expect-error ack payloadには文字列単体を返せない
const invalidConnectionPayload: GraphQLRuntime['onConnect'] = () => '文字列'
void [
  acceptConnection,
  rejectConnection,
  acceptWithoutPayload,
  invalidConnectionHook,
  invalidConnectionPayload,
]
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
