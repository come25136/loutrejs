# @loutrejs/graphql

LoutreのHTTP / WebSocket Executionを利用するGraphQL integrationです。標準の`GraphQLSchema`を使用し、HTTPは`graphql-http`、WebSocketは`graphql-ws`へ委譲します。

Query・Mutation・SubscriptionとDIを組み合わせたserverの実装例は、[GraphQL Counter Example](../../examples/graphql-counter/README.md)を参照してください。

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
```

```ts
import { buildSchema } from 'graphql'
import { graphql } from '@loutrejs/graphql'
import { defineModule } from '@loutrejs/loutre'

const schema = buildSchema('type Query { hello: String! }')
const endpoint = graphql.endpoint({
  name: 'Api',
  path: '/graphql',
  schema,
  transports: {
    http: true,
    websocket: { connectionInitWaitTimeout: 3_000 },
  },
  factory: () => ({ rootValue: { hello: () => 'Hello' } }),
})

export const ApiModule = defineModule(() => ({ executions: [endpoint] }))
```

`factory`のdefault parameterで通常の`inject(Service)`を使用できます。`context(input)`が返す値はresolverのcontextです。HTTPには`transport`、`request`、`signal`、middlewareの`state`を渡します。WebSocketには`transport`、opening `request`、`connectionParams`、`operationId`、operationごとの`signal`を渡します。

HTTP前段の認証やrate limitは`transports.http.middlewares`へ通常の`http.middleware()`を指定します。raw endpointを短絡するmiddlewareはFetch APIの`Response`を返します。`basicAuth()` / `bearerAuth()`も利用でき、`unauthorized()`から`Response`を返します。HTTP Contractのresponse variantを返すmiddlewareは、raw endpointでは`Response`を返すように定義してください。field単位のauthorizationはresolverで行います。

WebSocket clientは`graphql-transport-ws` subprotocolを指定してください。Subscription resolverはAsyncIterableを返し、operationの`signal`で停止できるようにします。`complete`、切断、Application drainではsignalがabortされ、iteratorの`return()`を呼び出します。保留中の外部I/Oもsignalで終了できるようにしてください。

transportを省略するとHTTPだけを有効にします。WebSocketだけの場合は`transports: { websocket: true }`を指定します。Node.js / Bun / Deno / Cloudflare Workersで両transportを利用でき、AWS LambdaはHTTPだけを利用します。

Bun 1.3ではserver側からWebSocketを閉じた後にnative `server.stop()`が完了しない[既知の不具合](https://github.com/oven-sh/bun/issues/36223)があります。Loutreのcleanupを完了してから、`forceShutdownTimeoutMs`（既定5秒）までnative stopを待機し、期限を過ぎたら強制停止します。

[設計](../../docs/adr/loutre_graphql_transport_architecture.md)
