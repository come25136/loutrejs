# GraphQLの方式別認証例

BearerとAPI keyを別のGraphQL endpointとして定義するNode.jsサーバーです。各endpointはHTTPとWebSocketを提供し、共通のSchema・Context・Resolverでプロフィールを取得・更新・購読できます。通常HTTPの例は[bearer-auth](../bearer-auth/README.md)と[basic-auth](../basic-auth/README.md)を参照してください。

## 起動

Node.js 22以降で、リポジトリルートから実行します。

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-auth
npm run start --workspace @loutrejs/example-graphql-auth
```

既定のポートは3000です。`PORT=3001`で変更できます。

| endpoint           | HTTPの資格情報                       | ConnectionInitのpayload                      |
| ------------------ | ------------------------------------ | -------------------------------------------- |
| `/graphql/bearer`  | `Authorization: Bearer momiji-token` | `{ "authorization": "Bearer momiji-token" }` |
| `/graphql/api-key` | `X-API-Key: momiji-key`              | `{ "apiKey": "momiji-key" }`                 |

上記はuser-1 / もみじのサンプル資格情報です。user-2 / かえでには`kaede-token`と`kaede-key`を使えます。各endpointは宣言した方式だけを受け付けます。WSの認証はConnectionInitのpayloadを読み、HTTPヘッダーへfallbackしません。

## 宣言とDI

```ts
http: { middlewares: [httpBearerAuthentication] },
ws: { connectionInit: [wsBearerAuthentication] },
factory: (users = inject(Users)) => ({
  context: ({ state, signal }) => ({
    currentUser: state.currentUser,
    users,
    signal,
  }),
})
```

[endpoint.ts](./src/endpoint.ts)で入口を宣言し、[bearer.ts](./src/auth/bearer.ts)と[api-key.ts](./src/auth/api-key.ts)で方式別のlayerを定義します。HTTPとWSの抽出処理は分け、各layer自身のfactoryでUsersをDIします。どのlayerも`next({ currentUser })`で同じ形のstateを渡します。

Context・Resolverは認証方式とtransportに依存しません。stateにはユーザーIDを保持し、表示データはUsersから最新値を取得します。stateや資格情報をACK payloadへ送りません。

## Query / Mutation

```sh
curl http://127.0.0.1:3000/graphql/bearer \
  -H 'Authorization: Bearer momiji-token' -H 'Content-Type: application/json' \
  --data '{"query":"{ viewer { id name } }"}'

curl http://127.0.0.1:3000/graphql/api-key \
  -H 'X-API-Key: momiji-key' -H 'Content-Type: application/json' \
  --data '{"query":"mutation { renameViewer(name: \"新しい名前\") { id name } }"}'
```

資格情報がない場合や方式が違う場合、HTTPでは401、WSでは接続拒否になります。

## Subscription

```js
import { createClient } from 'graphql-ws'

const client = createClient({
  url: 'ws://127.0.0.1:3000/graphql/bearer',
  connectionParams: { authorization: 'Bearer momiji-token' },
  retryAttempts: 0,
})
client.subscribe(
  { query: 'subscription { viewerChanged { id name } }' },
  { next: console.log, error: console.error, complete: () => {} },
)
```

Node.js 22で実行する場合は`ws`をimportし、`webSocketImpl`へ渡してください。API keyを使う場合はURLを`/graphql/api-key`、connectionParamsを`{ apiKey: 'momiji-key' }`へ変更します。

購読開始時に現在のプロフィールを返し、その後はそのユーザーの変更だけを通知します。認証はConnectionInitで一度だけ実行します。接続中の状態保持、operationへのstate伝播、切断時の解放はLoutreが扱います。即時失効や再認証の方針はアプリ側で決めます。

## 検証

```sh
npm run check --workspace @loutrejs/example-graphql-auth
npm run typecheck --workspace @loutrejs/example-graphql-auth
npm run generate:check --workspace @loutrejs/example-graphql-auth
npx vitest run tests/graphql-auth-example.integration.test.ts
```
