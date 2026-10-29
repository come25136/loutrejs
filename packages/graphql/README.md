# @loutrejs/graphql

CLIが生成したStatic SchemaをResolverとbindManifestで接続し、LoutreのHTTP / WebSocket Executionへ接続します。HTTPはgraphql-http、WebSocketはgraphql-ws、GraphQL ExecutionはGraphQL.jsへ委譲します。

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
npm install --save-dev @loutrejs/cli
```

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import type { AppContext } from './context.js'
import { resolvers } from './resolvers.js'

import { CounterStore } from './domain/counter.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const endpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: { connectionInitWaitTimeout: 3_000 } },
  factory: (counter = inject(CounterStore)) => ({
    context: ({ signal }) => ({ counter, signal }),
  }),
})
```

factoryとcontextは必須です。manifestが要求するContextを返してください。schema / typeDefs / rootValueを渡す経路は廃止しています。

Resolverはresolve({ parent, args, context, info })を使い、getFieldSelection(info)で先読み用の選択Field情報を取得できます。Batch取得を行うFieldには{ requires, read, load, authorize, maxBatchSize }を直接書きます。生成Resolvers<AppContext>とbindManifest<AppContext>がParent / Args / ResultをSDLとdomain mappingから推論します。

HTTP contextの入力はtransport / request / signal / middleware stateです。WebSocketはtransport / opening request / connectionParams / operationId / operation signalを渡します。DI Serviceと長寿命ContextのlifetimeはBatch QueueのScopeとは別です。BatchはQuery Operation、Mutation root Field、Subscription Delivery Eventごとに分離します。

HTTP前段の認証やrate limitはtransports.http.middlewaresへ指定します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### WebSocketの接続時認証

`factory`が返すRuntimeの`onConnect`で、`connection_init`のpayloadを`connectionParams`として検証できます。opening requestのヘッダーを使うクライアントにも対応できます。

```ts
factory: (auth = inject(AuthService)) => ({
  async onConnect({ connectionParams, request, signal }) {
    const authorization =
      connectionParams?.authorization ?? request.headers.get('authorization')
    return await auth.verify(authorization, { signal })
  },
  context: ({ request, signal }) => ({ request, signal }),
})
```

`onConnect`は接続ごとに実行され、完了するまで`connection_ack`を返しません。`false`なら4403で拒否し、`true`または戻り値なしなら受け入れます。オブジェクトを返すと`connection_ack.payload`としてクライアントへ送るため、認証情報などの秘密を含めないでください。予期しない例外は理由を公開せず1011で切断します。省略時は接続を受け入れます。

入力の`signal`は接続の切断・drainで中断されます。`connectionInitWaitTimeout`は最初の`connection_init`を待つ時間で、認証処理の実行時間の上限ではありません。外部認証サービスへのタイムアウトは認証処理側で設定してください。

接続の認証とoperationごとの認可は別です。`context()`には従来どおり各operationの`connectionParams`とoperation単位の`signal`を渡します。Runtimeは接続間で共有されるため、認証結果をRuntimeの可変フィールドへ保存しないでください。

transport省略時はHTTPのみです。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
