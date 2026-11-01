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
  http: true,
  ws: { connectionInitWaitTimeout: 3_000 },
  factory: (counter = inject(CounterStore)) => ({
    context: ({ signal }) => ({ counter, signal }),
  }),
})
```

factoryとcontextは必須です。manifestが要求するContextを返してください。schema / typeDefs / rootValueを渡す経路は廃止しています。

Resolverはresolve({ parent, args, context, info })を使い、getFieldSelection(info)で先読み用の選択Field情報を取得できます。Batch取得を行うFieldには{ requires, read, load, authorize, maxBatchSize }を直接書きます。生成Resolvers<AppContext>とbindManifest<AppContext>がParent / Args / ResultをSDLとdomain mappingから推論します。

HTTP contextの入力はtransport / request / signal / middleware stateです。WebSocketはtransport / opening request / connectionParams / operationId / operation signal / connection stateを渡します。DI Serviceと長寿命ContextのlifetimeはBatch QueueのScopeとは別です。BatchはQuery Operation、Mutation root Field、Subscription Delivery Eventごとに分離します。

HTTP前段の認証やrate limitはhttp.middlewaresへ指定します。middlewareが渡すstateの型は、`context()`と`formatError()`のHTTP入力へ推論します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### HTTPとGraphQL WSの認証

HTTPは`http.middlewares`へ既存のHTTP middlewareを指定します。GraphQL WSのライフサイクルは、DIしたサービスを使えるendpointの`factory().ws`へ直接書きます。外側の`ws`は有効化と待機時間などの静的設定です。

```ts
http: { middlewares: [httpBearerAuthentication] },
ws: true,
factory: (users = inject(Users)) => ({
  ws: {
    connectionInit: async ({ payload, signal }, next) => {
      signal.throwIfAborted()
      const user = users.authenticate({ authorization: payload?.authorization })
      if (!user) return Response.json({ error: '認証が必要です。' }, { status: 401 })
      return next({ currentUser: { id: user.id } })
    },
  },
  context: ({ state, signal }) => ({ currentUser: state.currentUser, users, signal }),
})
```

ConnectionInit handlerは`request`・`payload`・接続の`signal`を受け取ります。`return next(state)`で認証結果を渡し、HTTP middlewareの結果と同じ`input.state`からContext・Resolverへ渡します。戻り値からstateの型を推論するため、後処理を囲む場合も`try { return await next(state) } finally { ... }`と書きます。

`next()`の完了は接続全体の処理終了を待ちます。handler内の後処理はoperationのcleanup後に実行されます。`next`を複数回呼んだり、呼び出した結果をawait / returnせずにhandlerを終了したりすることは拒否します。stateは最上位を読み取り専用にし、接続間で分離します。

`next`を呼ぶ前にResponseを返すと接続を拒否します。stateや拒否応答のbodyをACK payloadへ送りません。前処理中に切断・drainした場合は待機を終了し、遅い成功を公開しません。外部I/Oはsignalに協調させてください。

### その他のWSライフサイクル

`factory().ws`は、`graphql-ws`の`onConnect`・`onDisconnect`・`onClose`も受け取ります。追加のprotocol制御が必要な場合に使い、引数・戻り値は依存ライブラリの規約に従います。`extra.request`はopening request、`extra.signal`は接続のsignalです。

ConnectionInit handlerの前処理後にonConnectを呼び、その完了後にACKします。onConnectの`false`は4403拒否、オブジェクトはクライアントへ送るACK payloadです。認証済み利用者をACK payloadへ保存しないでください。onDisconnectはACK済み接続、onCloseはACKされなかった接続も含む終了時に呼びます。終了フックはabort済みsignalでも終了を待ち、失敗してもoperation・iterator・sessionを解放します。

HTTP middlewareとWSのライフサイクルを同じlayerへ揃える設定は設けません。認証方式・payloadのキー・再認証の方針はアプリ側で決めます。[方式別の認証example](../../examples/graphql-auth/README.md)を参照してください。

`http`と`ws`を両方省略した場合はHTTPのみです。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[HTTP / WSの認証例](../../examples/graphql-auth/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
