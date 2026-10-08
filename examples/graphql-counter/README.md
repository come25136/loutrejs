# GraphQL Counter Example

共有SDLから型を生成し、domain mapping・DI・DataLoader・Subscriptionを組み合わせるNode.js serverです。同じ/graphqlでQuery / Mutation / Subscriptionを提供します。

## 起動

Node.js 22以上を使用し、repository rootで実行します。

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-counter
npm run dev --workspace @loutrejs/example-graphql-counter
```

HTTPはhttp://127.0.0.1:3000/graphql、WebSocketはws://127.0.0.1:3000/graphqlです。PORT=3001でportを変更できます。

## Serverの構成

- [contracts/counter.graphql](./contracts/counter.graphql): 共有するAPI契約。
- [graphql.codegen.json](./graphql.codegen.json): server / client生成、context型、domain mapping。
- [src/domain/counter.ts](./src/domain/counter.ts): valueとstepIdを持つdomainと変更通知。
- [src/domain/step.ts](./src/domain/step.ts): 関連するStepの一括取得。
- [src/graphql/resolvers.ts](./src/graphql/resolvers.ts): 生成したResolvers型を使い、Counter.stepをstepIdから解決。
- [src/graphql/context.ts](./src/graphql/context.ts) / [loaders.ts](./src/graphql/loaders.ts): operationのsignalとloader。cache:falseでbatchし、長寿命の購読cacheを保持しない。
- [src/endpoint.ts](./src/endpoint.ts): schemaとDIをcontextへ接続。
- [operations/snapshot.graphql](./operations/snapshot.graphql): 別の利用側でも共有SDLから型を生成できるoperation。

domainのCounterにはGraphQLのstep objectがありません。mappersによってresolverのparentをdomain型として扱い、stepIdで関連domainを取得します。取得・保存方法はGraphQLの契約に含めません。このexampleでは状態をメモリに持ち、再起動すると0へ戻ります。

## Query / Mutation

別terminalからQueryを実行します。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { counter { value step { amount } } activeSubscriptions }"}'
```

```json
{
  "data": {
    "counter": { "value": 0, "step": { "amount": 1 } },
    "activeSubscriptions": 0
  }
}
```

variablesを使って状態を変更します。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"mutation Add($amount: Int!) { increment(amount: $amount) { value } }","variables":{"amount":2}}'
```

```json
{ "data": { "increment": { "value": 2 } } }
```

mutation { reset { value } }で0へ戻せます。

Queryで`first: counter { step { amount } } second: counter { step { amount } }`を選択すると、同じoperationの取得が一回のbatchにまとまります。別QueryでstepBatchCountを前後に確認してください。

## Subscription

repository rootの別terminalで標準graphql-ws clientを実行します。

```sh
node --input-type=module <<'JS'
import { createClient } from 'graphql-ws'
const client = createClient({ url: 'ws://127.0.0.1:3000/graphql', retryAttempts: 0 })
const stop = client.subscribe(
  { query: 'subscription { counterChanged { value step { amount } } }' },
  {
    next: result => console.log(JSON.stringify(result)),
    error: error => console.error(error),
    complete: () => console.log('購読を終了しました。'),
  },
)
process.once('SIGINT', async () => { stop(); await client.dispose() })
JS
```

最初に現在値が届き、別terminalからのMutationで変更が届きます。clientを複数起動すれば両方へ配信されます。Ctrl+Cで停止します。activeSubscriptionsで購読数を確認でき、停止 / 切断で減ります。停止はserverへ非同期に伝わります。

## 生成と検証

```sh
npm run generate --workspace @loutrejs/example-graphql-counter
npm run generate:check --workspace @loutrejs/example-graphql-counter
npm run generate --workspace @loutrejs/example-graphql-counter -- --watch
npm run check --workspace @loutrejs/example-graphql-counter
npm run typecheck --workspace @loutrejs/example-graphql-counter
```

生成物はcommitします。SDLを変更したら再生成し、resolverとdomain型を更新して型検査してください。生成設定と契約共有は[GraphQLの型生成](../../docs/graphql-codegen.md)を参照してください。
