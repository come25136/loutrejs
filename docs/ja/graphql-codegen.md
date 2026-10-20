# GraphQLとCodegen

Loutreでは、GraphQLのSDLをコントラクトとして共有し、CLIでStatic Schemaや型付きResolverを生成できる。Query・MutationはHTTP、SubscriptionはWebSocketを使い、同じApplicationから公開する。

## インストール

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
npm install --save-dev @loutrejs/cli
```

## SDLを定義する

まず`contracts/counter.graphql`などのSDLを作る。Query、Mutation、Subscriptionを同じSchemaに定義できる。

```graphql
type Counter {
  value: Int!
}

type Query {
  counter: Counter!
}

type Mutation {
  increment(amount: Int!): Counter!
}

type Subscription {
  counterChanged: Counter!
}
```

## 型とSchemaを生成する

`graphql.config.ts`から、Server向けの`types.ts`、`schema-ast.ts`、`bindings.ts`を生成する。`schema`や`output`のパスは設定ファイルからの相対パスになる。

```ts
import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/*.graphql'],
      output: 'src/graphql/generated',
    },
  },
} satisfies GraphQLCodegenConfig
```

```sh
loutre graphql generate --config graphql.config.ts
loutre graphql generate --config graphql.config.ts --check
loutre graphql generate --config graphql.config.ts --watch
```

生成ファイルは直接変更せず、SDLを修正してから再生成する。Client向けのtargetを追加すると、Operationの変数・結果型と`TypedDocumentNode`も生成できる。

## EndpointとResolverを接続する

生成された`bindManifest`でSDLとResolverを関連付ける。Endpointの`factory`では、ApplicationのDIで受け取ったServiceをContextへ接続する。

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { bindManifest } from './graphql/generated/bindings.js'
import { schemaDocument } from './graphql/generated/schema-ast.js'
import { resolvers } from './graphql/resolvers.js'
import { CounterStore } from './domain/counter.js'
import type { AppContext } from './graphql/context.js'

const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })

export const endpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: (counter = inject(CounterStore)) => ({
    context: ({ signal }) => ({ counter, signal }),
  }),
})
```

Resolverは生成した`Resolvers<AppContext>`型で検証できる。通常の`resolve`やSubscriptionの`subscribe`は`{ parent, args, context, info }`を受け取る。GraphQLのSchemaをEndpointに直接渡す`schema`／`typeDefs` APIではなく、Manifestを利用する。

## Query・Mutation・Subscription

QueryやMutationはHTTPで実行できる。CounterのQueryは、Server起動後に次のように呼べる。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { counter { value } }"}'
```

SubscriptionにはWebSocket subprotocolの`graphql-transport-ws`を利用する。`subscribe`がAsyncIterableを返し、`resolve`がイベントを応答に変換する。購読解除・切断・drain時には`signal`の中断とiteratorの終了処理が伝播する。

Node.js、Bun、Cloudflare WorkersではHTTP／WebSocketの両Transportを使える。AWS LambdaではHTTPのみ対応する。

## Data ResolutionとN+1問題

関連Fieldを個別に問い合わせると、N+1問題が起きる場合がある。LoutreではFieldに`load`を定義し、複数のParentをまとめて処理できる。

```ts
const product = {
  requires: ['productId'],
  load: ({ parents: items, context, signal }) =>
    context.catalog.findForItems(items, { signal }),
}
```

上の`catalog`はApplication側が実装するServiceの例。`load`はParentと同じ順序・件数で結果を返す必要がある。必要に応じて`read`で先読み済みのFieldを再利用し、`authorize`で認可する。

Batch QueueはQuery Operation、Mutation root Field、SubscriptionのDelivery Eventごとに分離される。`getFieldSelection(info)`で選択されたFieldを先読み判断に使うこともできる。

## サンプルと詳細仕様

- [GraphQL Counter](https://github.com/come25136/loutrejs/tree/main/examples/graphql-counter)：Query、Mutation、Subscription、型付きBindingの使い方。
- [GraphQL Orders](https://github.com/come25136/loutrejs/tree/main/examples/graphql-orders)：EAGER／HYBRID／LAZYのData Resolutionを比較。
- [GraphQL実装ガイド（英語）](https://github.com/come25136/loutrejs/blob/main/docs/graphql-codegen.md)：Domain Mapper、Scalar、Error Formatting、認可、Batch Scopeの詳しい仕様。
