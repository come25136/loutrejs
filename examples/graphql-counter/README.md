# GraphQL Counter Example

Query・Mutation・Subscriptionを同じ`/graphql` endpointで提供するNode.js serverのexampleです。HTTPとWebSocketのresolverがDIで同じ`CounterStore`を取得し、Mutationによる状態変更を購読中のclientへ通知します。

## 起動

Node.js 22以上を使用し、repository rootで実行します。

```sh
npm ci
npm run build
npm run dev --workspace @loutrejs/example-graphql-counter
```

HTTPは`http://127.0.0.1:3000/graphql`、WebSocketは`ws://127.0.0.1:3000/graphql`です。portを変える場合は`PORT=3001 npm run dev --workspace @loutrejs/example-graphql-counter`で起動します。

## Serverの構成

- [`src/endpoint.ts`](./src/endpoint.ts): `GraphQLSchema`とresolverを`graphql.endpoint()`へ登録します。factoryのdefault parameterで`inject(CounterStore)`を使い、contextへoperationの`signal`を渡します。
- [`src/counter.ts`](./src/counter.ts): カウンターの状態と変更通知を管理します。SubscriptionのAsyncIterableは最初に現在値を返し、その後は変更を配信します。`AbortSignal`で待機を終了し、購読を解放します。
- [`src/app.ts`](./src/app.ts): providerとendpointをmoduleへ登録します。
- [`src/main.ts`](./src/main.ts): Node.js Runtimeでserverを起動します。

HTTPとWebSocketではfactoryが個別に実行されるため、共有したい状態はfactory内のlocal variableではなくproviderへ置きます。このexampleは単一processのメモリ内に状態を保持し、再起動すると0に戻ります。

## QueryとMutationを試す

別terminalからQueryを送ります。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { counter { value } activeSubscriptions }"}'
```

```json
{ "data": { "counter": { "value": 0 }, "activeSubscriptions": 0 } }
```

variablesを使ったMutationでカウンターを増やします。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"mutation Add($amount: Int!) { increment(amount: $amount) { value } }","variables":{"amount":2}}'
```

```json
{ "data": { "increment": { "value": 2 } } }
```

`mutation { reset { value } }`で0に戻せます。未知のfield、不正なvariables、GraphQL Intの範囲を超える変更はGraphQLの`errors`として返ります。

## Subscriptionを試す

repository rootの別terminalで、標準の`graphql-ws` clientを実行します。Node.jsの組み込みWebSocketを使用します。

```sh
node --input-type=module <<'JS'
import { createClient } from 'graphql-ws'

const client = createClient({
  url: 'ws://127.0.0.1:3000/graphql',
  retryAttempts: 0,
})
const stop = client.subscribe(
  { query: 'subscription { counterChanged { value } }' },
  {
    next: (result) => console.log(JSON.stringify(result)),
    error: (error) => console.error(error),
    complete: () => console.log('購読を終了しました。'),
  },
)
process.once('SIGINT', async () => {
  stop()
  await client.dispose()
})
JS
```

最初に現在値が届きます。購読を続けたまま別terminalからMutationを実行すると、更新後の値が届きます。同じclientをもう一つ起動すれば、両方へ通知されることを確認できます。

`Ctrl+C`で停止してください。Queryの`activeSubscriptions`は購読の開始で増え、停止・切断で減ります。停止はserverへ非同期に伝わります。

## Applicationの検証

```sh
npm run check --workspace @loutrejs/example-graphql-counter
npm run typecheck --workspace @loutrejs/example-graphql-counter
```

GraphQL integrationの設定は[`@loutrejs/graphql`](../../packages/graphql/README.md)を参照してください。
