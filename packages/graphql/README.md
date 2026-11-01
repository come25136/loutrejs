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

HTTP contextの入力はtransport / request / signal / middleware stateです。WebSocketはtransport / opening request / connectionParams / operationId / operation signalを渡します。DI Serviceと長寿命ContextのlifetimeはBatch QueueのScopeとは別です。BatchはQuery Operation、Mutation root Field、Subscription Delivery Eventごとに分離します。

HTTP前段の認証やrate limitはhttp.middlewaresへ指定します。middlewareが渡すstateの型は、`context()`と`formatError()`のHTTP入力へ推論します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### HTTP / ConnectionInitとstate

認証の入口はendpointの`http.middlewares`と`ws.connectionInit`へ分けて宣言します。layer自身のfactoryでDIし、`next(state)`で渡した認証結果を`context()`と`formatError()`から型付きで使います。

```ts
http: { middlewares: [httpBearerAuthentication] },
ws: { connectionInit: [wsBearerAuthentication] },
factory: (users = inject(Users)) => ({
  context: ({ state, signal }) => ({ currentUser: state.currentUser, users, signal }),
})
```

HTTPは既存のHTTP middlewareを使います。WSのConnectionInitは`defineLayer`で定義し、入力の`payload`、`request`、`signal`を持つ`GraphQLConnectionInitContext`を使います。認証方式やpayloadのキーはアプリ側で決めます。共通の認証layerを自動適用したり、HTTPヘッダーとWS payloadを自動変換したりしません。

HTTPのstateとConnectionInitのstateは、それぞれ指定したlayerから独立して型推論します。両者が同じ認証結果の形を渡せば、Context・Resolverを共通化できます。有効にした入口だけがContext入力の型に現れます。

WSの認証はConnectionInitごとに一度実行し、各operationへstateを渡します。`await next()`は接続全体を囲み、operationのcleanup後にlayerの後処理を待ちます。stateの結合とnextの規約は既存のgeneric layerに従います。Responseで短絡するとHTTPでは応答を返し、WSでは接続を拒否します。stateや拒否応答のbodyをACK payloadへ送信しません。

WSの中断後は前処理の待機を終え、遅い成功からACKしません。外部I/Oはsignalに協調させてください。[方式別の認証example](../../examples/graphql-auth/README.md)を参照してください。

### WebSocketの接続フック

`factory`の戻り値の`websocket`で、`graphql-ws`の`onConnect` / `onDisconnect` / `onClose`を設定できます。コールバックの引数・戻り値は`graphql-ws`の規約を使います。Loutreは`extra.request`へopening request、`extra.signal`へ接続のAbortSignalを渡します。

```ts
factory: (auth = inject(AuthService)) => ({
  websocket: {
    onConnect: ({ connectionParams, extra }) =>
      auth.acceptConnection({
        request: extra.request,
        connectionParams,
        signal: extra.signal,
      }),
  },
  context: ({ request, signal }) => ({ request, signal }),
})
```

`onConnect`は`connection_init`受信時に呼ばれ、完了後にackします。`false`を返すと4403で拒否し、オブジェクトを返すとその値をack payloadとしてクライアントへ送ります。認証済み利用者を保存するためにack payloadを使わないでください。接続中断後の遅い成功はackせず、フックが中断に協調しなくてもLoutre側の待機を終了します。外部I/O自体の中断やtimeoutはフックの実装で扱ってください。

`onDisconnect`はack済み接続の終了時、`onClose`はackされなかった接続も含む終了時に呼ばれます。終了フックには既にabortされたsignalを渡し、フックの終了を待ちます。終了フックの失敗時もLoutreのoperationとiteratorをcleanupします。

接続フックは認証方式や利用者の形を定義しません。HTTPの前処理は`http.middlewares`、WSの前処理は`ws.connectionInit`、operationごとの処理は`context()`を使います。`context()`へ渡す`connectionParams`はクライアント入力で、Loutreはヘッダーや利用者情報へ自動変換しません。再認証の頻度や失効時の扱いもアプリ側で決めます。

公開するのは接続フックだけです。schema / execute / subscribe / context / operation用フックはこの`websocket`設定で上書きできません。

`http`と`ws`を両方省略した場合はHTTPのみです。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[HTTP / WSの認証例](../../examples/graphql-auth/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
