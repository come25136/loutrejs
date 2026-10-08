# @loutrejs/graphql

標準のGraphQLSchemaに登録したresolve / subscribeを、LoutreのHTTP / WebSocket Executionで実行するintegrationです。HTTPはgraphql-http、WebSocketはgraphql-wsへ委譲します。

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql @graphql-tools/schema
npm install --save-dev @loutrejs/cli
```

SDLからCLIでresolver型とtypeDefsを生成し、domain型とcontextへ接続してください。

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { typeDefs } from './generated/server.js'
import { resolvers } from './graphql/resolvers.js'
import { CounterStore } from './domain/counter.js'

const endpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  schema: makeExecutableSchema({ typeDefs, resolvers }),
  transports: { http: true, websocket: { connectionInitWaitTimeout: 3_000 } },
  factory: (counter = inject(CounterStore)) => ({
    context: (input) => ({ counter, signal: input.signal }),
  }),
})
```

factoryとcontext関数は必須です。rootValueは廃止しました。Query / Mutationのroot fieldにはresolve、Subscriptionのroot fieldにはsubscribeとresolveを登録します。通常のobject fieldはGraphQL標準のdefault resolverを使用できます。custom scalarには出力coercionを明示し、入力に使う場合はparse処理も実装してください。

factoryのdefault parameterで通常のinject(Service)を使えます。HTTPとWebSocketではfactoryを個別に実行するため、共有するdomainの状態はDI providerへ置きます。contextはoperationごとに生成し、loaderもここへ置きます。Subscriptionのcontextは購読中維持されるため、exampleではDataLoaderのcache:falseを使用します。

HTTP contextの入力はtransport / request / signal / middlewareのstateです。WebSocketはtransport / opening request / connectionParams / operationId / operationごとのsignalを渡します。

HTTP前段の認証やrate limitはtransports.http.middlewaresへhttp.middleware()を指定します。raw endpointを短絡するmiddlewareはFetch APIのResponseを返します。basicAuth() / bearerAuth()も使用でき、unauthorized()からResponseを返します。field単位のauthorizationはresolverで行います。

WebSocketはgraphql-transport-ws subprotocolを使用します。SubscriptionのAsyncIterableはoperationのsignalに協調して停止してください。complete / 切断 / Application drainではsignalのabortとiterator.returnを伝播します。

transport省略時はHTTPだけを有効にします。WebSocketだけの場合はtransports: { websocket: true }を指定します。Node.js / Bun / Deno / Cloudflare Workersで両transport、AWS LambdaではHTTPだけを使用できます。

Bun 1.3のserver側WebSocket close後にnative stopが完了しない[既知の不具合](https://github.com/oven-sh/bun/issues/36223)には、cleanup後のnative stopにもforceShutdownTimeoutMs（既定5秒）を適用します。

[実行可能なserver example](../../examples/graphql-counter/README.md)、[CLIによる型生成](../../docs/graphql-codegen.md)、[transport設計](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
