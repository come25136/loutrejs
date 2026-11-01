# HTTP / GraphQL WebSocketの認証例

通常のHTTP、GraphQL HTTP、GraphQL WebSocketで同じユーザー認証を使うNode.jsサーバーです。BearerとAPI keyをアプリ側で解釈し、Loutreには認証方式や利用者を表す型を追加しません。

## 起動

Node.js 22以降で、リポジトリルートから実行します。

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-auth
npm run start --workspace @loutrejs/example-graphql-auth
```

既定のポートは3000です。`PORT=3001`で変更できます。サンプル用の固定資格情報は次のとおりです。

| 利用者          | Bearer token | API key    |
| --------------- | ------------ | ---------- |
| user-1 / もみじ | momiji-token | momiji-key |
| user-2 / かえで | kaede-token  | kaede-key  |

## 構成

同じプロフィール機能の入口を通信方式ごとに定義します。

- [ProfileHttp](./src/auth/http.ts): 通常HTTPの`/me`。
- [ProfileGraphQL](./src/endpoint.ts): GraphQLのQuery / Mutation / Subscription。

認証は両者が共有する前処理であり、入口の機能名とは分けます。

## HTTP

通常のHTTPとGraphQL HTTPは同じ認証の前処理を使います。

```sh
curl http://127.0.0.1:3000/me -H 'Authorization: Bearer momiji-token'
curl http://127.0.0.1:3000/graphql \
  -H 'X-API-Key: momiji-key' -H 'Content-Type: application/json' \
  --data '{"query":"{ viewer { id name } }"}'
```

資格情報がない場合や不正な場合は、どちらも401です。GraphQLは共有middlewareから認証結果を受け取り、`context({ state })`で型付きのまま使います。通常HTTPにも同じ認証layerを指定します。Context生成で資格情報を再検証する必要はありません。

## WebSocket

ブラウザからは`connectionParams`で資格情報を送ります。この例の`authorization`と`apiKey`はアプリが決めたキーです。Loutreは特別扱いしません。

```js
import { createClient } from 'graphql-ws'

const client = createClient({
  url: 'ws://127.0.0.1:3000/graphql',
  connectionParams: { authorization: 'Bearer momiji-token' },
  retryAttempts: 0,
})
const stop = client.subscribe(
  { query: 'subscription { viewerChanged { id name } }' },
  { next: console.log, error: console.error, complete: () => {} },
)
```

Node.js 22で実行する場合は`ws`をimportして`webSocketImpl`へ渡してください。Postman等でopening requestにヘッダーを送れる場合は、HTTPと同じヘッダーも使えます。ヘッダーの資格情報を優先し、不正な値をpayloadの別資格情報で迂回しません。

購読開始時に自分のユーザー情報を返し、次のMutationで名前を変更すると、そのユーザーの購読だけに通知します。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'Authorization: Bearer momiji-token' -H 'Content-Type: application/json' \
  --data '{"query":"mutation { renameViewer(name: \"新しい名前\") { id name } }"}'
```

## 利用するAPI

```ts
middlewares: [authentication],
factory: (users = inject(Users)) => ({
  context: ({ state, signal }) => ({
    currentUser: state.currentUser,
    users,
    signal,
  }),
})
```

利用者は既存のlayerで前処理し、HTTPでもWSでもその結果を`state`から参照します。`onConnect`、ACK、接続記録の対応表、切断時の削除処理は不要です。認証以外の前処理にも同じAPIを使えます。

## アプリとフレームワークの境界

- `Users`は資格情報の検証とユーザーデータを所有します。
- `authentication`は既存の`defineLayer`で定義する共有middlewareです。ヘッダーと任意の`connectionParams`から資格情報を取り出し、`next({ currentUser })`で認証結果を渡すか、`Response`で短絡します。通常HTTPとGraphQLへ同じlayerを指定します。
- Loutreは前処理の結果を型付きの`input.state`へ渡します。HTTP専用middlewareのstateとも、既存layerの結合規約に従って結合します。
- HTTPではリクエストごと、WSでは接続開始時に前処理を実行します。WSで複数operationを実行しても資格情報の検証を繰り返しません。接続ごとのstateは分離し、切断時にはLoutreが保持を終了します。認証結果にはユーザーIDを保持し、表示するユーザー情報はResolverで最新値を取得します。
- 前処理が`Response`を返した場合、HTTPではその応答を返し、WSでは接続を拒否します。前処理の結果や拒否応答のbodyをACK payloadへ送りません。
- 認証方式、利用者の形、失効・再検証の方針はアプリ側で決めます。接続フックは追加のprotocol制御が必要な場合だけ使います。

この例はWS接続時の認証結果を接続中に共有します。即時失効や利用者情報の再取得が必要なら、アプリの認証・Resolverで扱ってください。

## 検証

```sh
npm run check --workspace @loutrejs/example-graphql-auth
npm run typecheck --workspace @loutrejs/example-graphql-auth
npm run generate:check --workspace @loutrejs/example-graphql-auth
npx vitest run tests/graphql-auth-example.integration.test.ts
```
