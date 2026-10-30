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

HTTP contextの入力はtransport / request / signal / middleware state / identityです。WebSocketはtransport / opening request / connectionParams / operationId / operation signal / identityを渡します。DI Serviceと長寿命ContextのlifetimeはBatch QueueのScopeとは別です。BatchはQuery Operation、Mutation root Field、Subscription Delivery Eventごとに分離します。

HTTP前段の認証やrate limitはtransports.http.middlewaresへ指定します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### HTTP / WebSocketの共通認証

`factory`が返すRuntimeの`authenticate(token, { signal })`を両transportの認証に使用します。通常のHTTPの`bearerAuth`にも同じ関数を渡せます。戻り値は認証済み利用者のオブジェクトで、`null`または`undefined`は拒否、例外は認証サービスの障害です。Policyや接続イベント用の認証フックは追加しません。

```ts
factory: (users = inject(UserRepository)) => ({
  authenticate: (token, { signal }) => users.authenticate(token, { signal }),
  context: ({ identity, signal }) => ({ currentUser: identity, signal }),
})
```

HTTPはAuthorizationヘッダー、WSは`connection_init.payload.authorization`またはopening requestのAuthorizationヘッダーから`Bearer <token>`を取り出します。WSの両方に指定した場合やpayloadの値が文字列以外の場合は4400で拒否し、不正なpayloadからヘッダーへfallbackしません。payloadのキーは小文字の`authorization`のみです。

HTTPはリクエストごと、WSはinit時と各operation開始時に認証します。成功した利用者を`context()`の`identity`へ渡し、Policyを挟まずauthenticateの戻り値から型を推論します。未指定のRuntimeでは認証せず、`identity`は`undefined`です。HTTP middlewareへ同じ認証を重複登録しないでください。

認証拒否はHTTPでは401と`WWW-Authenticate: Bearer`、WSではack前の4403、後続operationでも4403で接続を終了します。成功してもidentityをack payloadへ送りません。認証サービスの例外は詳細を公開せずHTTP 500 / WS 1011にします。

`signal`はHTTPリクエスト、WS接続またはoperationの中断を伝えます。adapterは中断後に遅れて成功した結果を採用せず、認証サービスがsignalに協調しなくても待機を終了します。外部認証のtimeoutは認証サービス側で設定してください。`connectionInitWaitTimeout`は最初のinitを待つ時間で、認証の実行時間ではありません。

接続の認証とResolverの認可は別です。開始済みSubscriptionの即時失効や期限での強制再接続はこの認証関数だけでは提供しません。必要な切断・配送時の認可はアプリケーション側で設計します。認証結果を共有Runtimeの可変フィールドへ保存しないでください。

transport省略時はHTTPのみです。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。
