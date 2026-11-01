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

HTTP前段の認証やrate limitはtransports.http.middlewaresへ指定します。middlewareが渡すstateの型は、`context()`と`formatError()`のHTTP入力へ推論します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### middlewareとstate

endpointの`middlewares`へ既存のgeneric layerを指定します。HTTP / WSで同じ前処理を使い、layerが`next(state)`で渡した値を`context()`と`formatError()`の`input.state`から型付きで参照します。

```ts
middlewares: [authentication],
factory: (users = inject(Users)) => ({
  context: ({ state, signal }) => ({ currentUser: state.currentUser, users, signal }),
})
```

共有layerは`defineLayer`で定義します。入力は`request`、`signal`、任意の`connectionParams`を持つ`GraphQLMiddlewareContext`です。通常HTTPのmiddlewareとしても同じlayerを使えます。認証方式や利用者の型はアプリ側で決めます。

HTTPでは通常のmiddleware pipelineで実行し、`transports.http.middlewares`を後ろへ追加します。WSでは接続開始時に同じgeneric layerの合成処理を使い、各operationへ結果のstateを渡します。`await next()`は接続の処理全体を囲み、operationの終了処理後にlayerの後処理を実行します。stateの分離・結合・上書き拒否、`next()`の実行規約は既存layerの動作に従います。

Responseで短絡するとHTTPではその応答を返し、WSでは接続を拒否します。stateや拒否応答のbodyはACK payloadへ送りません。WSの中断後はmiddlewareの待機を終了し、遅い成功からACKしません。外部I/Oは渡されたsignalに協調させてください。

共有middlewareを省略した場合、HTTPはHTTP専用middlewareのstate、WSは空のstateを渡します。独自の`state()`前処理は設けません。[認証example](../../examples/graphql-auth/README.md)を参照してください。

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

接続フックは認証方式や利用者の形を定義しません。HTTP / WSの共通前処理は`middlewares`、operationごとの処理は`context()`を使います。`context()`へ渡す`connectionParams`はクライアント入力で、Loutreはヘッダーや利用者情報へ自動変換しません。再認証の頻度や失効時の扱いもアプリ側で決めます。

公開するのは接続フックだけです。schema / execute / subscribe / context / operation用フックはこの`websocket`設定で上書きできません。

transport省略時はHTTPのみです。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[HTTP / WSの認証例](../../examples/graphql-auth/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
