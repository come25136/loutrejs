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

## HTTP

通常のHTTPとGraphQL HTTPは同じmiddlewareを使います。

```sh
curl http://127.0.0.1:3000/me -H 'Authorization: Bearer momiji-token'
curl http://127.0.0.1:3000/graphql \
  -H 'X-API-Key: momiji-key' -H 'Content-Type: application/json' \
  --data '{"query":"{ viewer { id name } }"}'
```

資格情報がない場合や不正な場合は、どちらも401です。HTTP middlewareのstateはGraphQLの`context()`にも型付きで渡します。認証のためにContext生成で資格情報を再検証する必要はありません。

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

## アプリとフレームワークの境界

- `Users`は資格情報の検証とユーザーデータを所有します。HTTP middlewareとWS接続処理は同じインスタンスを使います。
- `Connections`はopening requestをキーに認証済みユーザーIDを保持します。`onConnect`で登録し、`onClose`で削除します。利用者情報をack payloadへ返しません。
- endpointは、HTTPのmiddleware stateまたはWSの接続情報から`AppContext`を作ります。接続ごとの可変値をfactoryの単一変数へ保存しません。
- この例はWS接続時に一度だけ資格情報を検証します。operation開始時には保存したユーザーIDから現在の情報を取得します。トークンの失効・再検証・接続数制限が必要なら、このアプリのサービスに追加します。
- LoutreはDI、型、signal、operationとiteratorの終了処理を担当し、`graphql-ws`の接続フックの意味を変更しません。

認証方式を統一するフレームワークAPIよりも、サービスを共有する薄いtransport adapterを選びます。接続中の状態を管理する小さなアプリのサービスは残りますが、その所有者と寿命が明示されます。

## 検証

```sh
npm run check --workspace @loutrejs/example-graphql-auth
npm run typecheck --workspace @loutrejs/example-graphql-auth
npm run generate:check --workspace @loutrejs/example-graphql-auth
npx vitest run tests/graphql-auth-example.integration.test.ts
```
