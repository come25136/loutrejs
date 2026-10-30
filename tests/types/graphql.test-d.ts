import { parse, type GraphQLError, type GraphQLFormattedError } from 'graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import { graphql, type GraphQLRuntime } from '@loutrejs/graphql'
import {
  defineApplication,
  defineModule,
  createKernelApplication,
} from '@loutrejs/loutre'
import { http, type BearerAuthenticator } from '@loutrejs/loutre/http'
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
graphql.endpoint({
  name: 'Public',
  path: '/public',
  manifest,
  factory: () => ({
    context(input) {
      const identity: undefined = input.identity
      void identity
      return {}
    },
  }),
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
    async authenticate(token, { signal }) {
      const value: string = token
      const abort: AbortSignal = signal
      void [value, abort]
      return token === 'valid' ? { id: 'alice' } : null
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
      const identity: { id: string } = input.identity
      const identityId: string = input.identity.id
      // @ts-expect-error 利用者の未定義フィールドを許可しない
      input.identity.missing
      void [identity, identityId]
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

type Authenticate = NonNullable<GraphQLRuntime['authenticate']>
// @ts-expect-error 認証関数はbooleanを利用者として返せない
const invalidAuthenticator: Authenticate = () => true
void invalidAuthenticator

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
  // @ts-expect-error formatErrorは同期的なGraphQLFormattedErrorを返す
  factory: () => ({
    context: () => ({}),
    formatError: async () => ({ message: 'error' }),
  }),
})
graphql.endpoint({
  name: 'MissingMessage',
  path: '/graphql',
  manifest,
  // @ts-expect-error 整形済みエラーにはmessageが必要
  factory: () => ({
    context: () => ({}),
    formatError: () => ({ extensions: {} }),
  }),
})

const sharedAuthenticate: BearerAuthenticator<{ id: string }> = (token) =>
  token === 'valid' ? { id: 'alice' } : null
graphql.endpoint({
  name: 'ContextFirst',
  path: '/ordered',
  manifest,
  factory: () => ({
    context({ identity }) {
      const id: string = identity.id
      return { id }
    },
    authenticate: sharedAuthenticate,
  }),
})
const maybeAuthenticate = {} as {
  authenticate?: NonNullable<GraphQLRuntime['authenticate']>
}
graphql.endpoint({
  name: 'DynamicAuth',
  path: '/dynamic',
  manifest,
  // @ts-expect-error 認証関数の有無を不確定にしたままidentityを非optionalにできない
  factory: () => ({ ...maybeAuthenticate, context: () => ({}) }),
})
