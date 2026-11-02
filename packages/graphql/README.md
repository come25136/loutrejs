# @loutrejs/graphql

CLIが生成したStatic SchemaをResolverとbindManifestで接続し、LoutreのHTTP / WebSocket Executionへ接続します。HTTPはgraphql-http、WebSocketはgraphql-ws、GraphQL ExecutionはGraphQL.jsへ委譲します。

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
npm install --save-dev @loutrejs/cli
```

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import type { AppContext } from './context.js'
import { resolvers } from './resolvers.js'

import { CounterStore } from './domain/counter.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

const Api = http.contract({
  graphql: { raw: true, method: '*', path: '/graphql' },
})

export const endpoint = graphql.implementation({
  name: 'Counter',
  route: Api.routes.graphql,
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

HTTP前段の認証やrate limitはHTTP Contractのルートへ指定します。middlewareが渡すstateの型は、`context()`と`formatError()`のHTTP入力へ推論します。raw endpointを短絡するmiddlewareはFetch Responseを返します。Batch設定のauthorizeで先読み値のreuseにも認可を適用してください。

WebSocketはgraphql-transport-ws subprotocolを使用します。Subscription Sourceと外部I/Oはsignalに協調して停止してください。complete / 切断 / drainでAbortとiterator.returnを伝播します。

### HTTPとGraphQL WSの認証

HTTPはHTTP Contractのrawルートへ既存middlewareを指定します。GraphQL WSのライフサイクルは、DIしたサービスを使えるendpointの`factory().ws`へ直接書きます。外側の`ws`は有効化と待機時間などの静的設定です。`route`はhttp.contractで作成したrawルートを指定し、path・method・middlewareを実装側へ再指定しません。

```ts
import { ConnectionRejected } from '@loutrejs/graphql'

const httpAuthentication = http.middleware<{ currentUser?: { id: string } }>({
  name: 'HttpAuthentication',
  factory: (users = inject(Users)) => async ({ request }, next) => {
    if (http.isWebSocketUpgrade(request)) return next({})

    const user = users.authenticate({ authorization: request.headers.get('authorization') })
    if (!user) return new Response('Authentication required.', { status: 401 })

    return next({ currentUser: { id: user.id } })
  },
})

const Api = http.contract({ profile: { raw: true, method: '*', path: '/graphql', middlewares: [httpAuthentication] } })

route: Api.routes.profile,
ws: true,
factory: (users = inject(Users)) => ({
  ws: {
    connectionInit: async ({ payload }) => {
      const user = users.authenticate({ authorization: payload?.authorization })
      if (!user) return new ConnectionRejected('Authentication required.')

      return { currentUser: { id: user.id } }
    },
  },

  context: ({ state, signal }) => {
    if (!state.currentUser) throw new Error('Authenticated user is missing.')

    return { currentUser: state.currentUser, users, signal }
  },
})
```

ConnectionInit handlerは`request`・`payload`・接続の`signal`・handshake middlewareの`state`を受け取り、stateのオブジェクトを返します。同期・非同期のどちらも使え、戻り値から`context()`と`formatError()`のWS stateを推論します。HTTP middlewareの認証結果と同じ形なら、Context・Resolverを共通化できます。

拒否する場合は`@loutrejs/graphql`の`ConnectionRejected`を返します。`new ConnectionRejected('Authentication required.')`なら、クライアントへ4403とその理由を通知します。理由は公開情報として扱い、UTF-8で123バイト以内にします。省略時は「Connection rejected.」です。HTTP Response、boolean、戻り値の省略は受け付けません。stateはACK payloadへ送らず、最上位を読み取り専用にして接続ごとに保持します。

前処理中に切断・drainした場合は待機を終了し、遅い成功を公開しません。非同期I/Oには接続のsignalを渡してください。前処理中に確保したresourceは、signalによる中断も含めてアプリ側で解放してください。

### 接続終了のライフサイクル

`factory().ws`の`onDisconnect`・`onClose`は`graphql-ws`の引数・戻り値に従います。`extra.request`はopening request、`extra.signal`は接続のsignal、`extra.state`はConnectionInitで受け取ったstateです。init前や拒否された接続ではstateは`undefined`です。

onDisconnectはACK済み接続、onCloseはACK前を含む終了時に呼びます。購読の終了処理後に呼び出すため、接続中に保持するresourceはonCloseで解放できます。終了フックはabort済みsignalでも終了を待ちます。購読の終了処理やonDisconnectが失敗してもonCloseを呼び出し、失敗を集めて報告した後にsessionを解放します。

接続開始の処理はconnectionInitへまとめます。認証方式・payloadのキー・再認証の方針はアプリ側で決めます。[同じURLを使う認証example](../../examples/graphql-auth/README.md)を参照してください。

HTTPは既定で有効です。`ws: true`や待機時間の設定を追加してもHTTPは無効になりません。WS専用にする場合は`http: false`を明示します。factory内にws handlerを置く場合は、外側でもWSを有効にしてください。有効化を忘れた設定は型チェックとApplication Modelの構築時に拒否します。

`ws`の既定は無効です。Node.js / Bun / Cloudflare Workersでは両transport、AWS LambdaではHTTPのみを使用できます。Runtimeは静的ESMとしてbundleでき、Schema fileの読み込みやNode専用APIを要求しません。

[生成・Data Resolutionガイド](../../docs/graphql-codegen.md)、[Counter server](../../examples/graphql-counter/README.md)、[HTTP / WSの認証例](../../examples/graphql-auth/README.md)、[注文server](../../examples/graphql-orders/README.md)、[transport ADR](../../docs/adr/loutre_graphql_transport_architecture.md)を参照してください。

HTTP Contractのbranch pathとmiddlewareはGraphQLルートにも継承します。HTTP middlewareは通常HTTPとWS Upgradeの両方で実行します。WS認証をConnectionInitへ任せる場合はmiddleware自身でhttp.isWebSocketUpgrade(request)を使って判定します。WSを有効にするルートのmethodはGETまたは*にしてください。通常HTTPとrawルートは同じContractへ並べられ、http.implementationは通常HTTPのルートを担当します。

Upgradeのmiddlewareが渡したstateはconnectionInitのinput.stateから読めます。ConnectionInitを省略した場合は、そのstateをoperationでも使います。ConnectionInitを定義する場合は、operationへ渡すstateを戻り値で決めます。middlewareのnextはhandshakeの完了までを担当し、接続全体の終了処理はonCloseへ置きます。認証を後回しにしたUpgrade要求が通常HTTP handlerへ流れる経路は拒否します。
