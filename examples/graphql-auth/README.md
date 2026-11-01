# 同じURLを使うGraphQL HTTP / WebSocket認証例

`/graphql`一つをHTTPとWebSocketで共有するNode.jsサーバーです。BearerまたはAPI keyで認証し、共通のSchema・Context・Resolverでプロフィールを取得・更新・購読できます。

## 起動

Node.js 22以降で、リポジトリルートから実行します。

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-auth
npm run start --workspace @loutrejs/example-graphql-auth
```

既定のポートは3000です。`PORT=3001`で変更できます。

| transport | 接続先                          |
| --------- | ------------------------------- |
| HTTP      | `http://127.0.0.1:3000/graphql` |
| WebSocket | `ws://127.0.0.1:3000/graphql`   |

| 認証方式 | HTTPヘッダー                         | ConnectionInitのpayload                      |
| -------- | ------------------------------------ | -------------------------------------------- |
| Bearer   | `Authorization: Bearer momiji-token` | `{ "authorization": "Bearer momiji-token" }` |
| API key  | `X-API-Key: momiji-key`              | `{ "apiKey": "momiji-key" }`                 |

上記はuser-1 / もみじのサンプル資格情報です。user-2 / かえでには`kaede-token`と`kaede-key`を使えます。認証方式によってURLは変わりません。

WSはConnectionInitのpayloadを読み、接続時のHTTPヘッダーへfallbackしません。

## 宣言とDI

[contract.ts](./src/contract.ts)で、通常HTTPの`/health`とGraphQLの`/graphql`を定義します。[auth/http.ts](./src/auth/http.ts)のmiddlewareが、HTTPヘッダーからBearerまたはAPI keyを読み取ります。

```ts
const ApiContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
  graphql: {
    raw: true,
    method: '*',
    path: '/graphql',
    middlewares: [httpAuthentication],
  },
})
```

[health.ts](./src/health.ts)は通常HTTP、[endpoint.ts](./src/endpoint.ts)はGraphQL HTTPとWSを担当します。GraphQL実装は同じルート参照から両方の入口を作ります。

```ts
const ProfileGraphQL = graphql.implementation({
  name: 'ProfileGraphQL',
  route: ApiContract.routes.graphql,
  manifest,
  ws: true,
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate({
          authorization: payload?.authorization,
          apiKey: payload?.apiKey,
        })
        if (!user) return new ConnectionRejected('認証が必要です。')
        return { currentUser: { id: user.id } }
      },
    },
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})
```

HTTP middlewareは通常のHTTP要求で実行します。WSのUpgradeでは実行せず、ConnectionInitで認証します。どちらもstateへユーザーIDを保持し、表示データはUsersから最新値を取得します。stateや資格情報をACK payloadへ送りません。

## Query / Mutation

同じURLへ、いずれかのHTTPヘッダーを付けます。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'Authorization: Bearer momiji-token' -H 'Content-Type: application/json' \
  --data '{"query":"{ viewer { id name } }"}'

curl http://127.0.0.1:3000/graphql \
  -H 'X-API-Key: momiji-key' -H 'Content-Type: application/json' \
  --data '{"query":"mutation { renameViewer(name: \"新しい名前\") { id name } }"}'
```

## Subscription

```js
import { createClient } from 'graphql-ws'

const client = createClient({
  url: 'ws://127.0.0.1:3000/graphql',
  connectionParams: { apiKey: 'momiji-key' },
  retryAttempts: 0,
})
client.subscribe(
  { query: 'subscription { viewerChanged { id name } }' },
  { next: console.log, error: console.error, complete: () => {} },
)
```

Bearerを使う場合はconnectionParamsを`{ authorization: 'Bearer momiji-token' }`へ変更します。Node.js 22では`ws`をimportし、`webSocketImpl`へ渡してください。

購読開始時に現在のプロフィールを返し、その後はそのユーザーの変更だけを通知します。同じURLへのHTTP Mutationで更新すると、WS Subscriptionへ届きます。認証はConnectionInitで一度だけ実行します。資格情報がない場合や不正な場合、HTTPは401、WSは4403で拒否します。即時失効や再認証の方針はアプリ側で決めます。

## 検証

```sh
npm run check --workspace @loutrejs/example-graphql-auth
npm run typecheck --workspace @loutrejs/example-graphql-auth
npm run generate:check --workspace @loutrejs/example-graphql-auth
npx vitest run tests/graphql-auth-example.integration.test.ts
```

通常HTTPの認証例は[bearer-auth](../bearer-auth/README.md)と[basic-auth](../basic-auth/README.md)を参照してください。
