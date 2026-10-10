# GraphQL Orders Example

手書きBindingと生成Typed Field Builderで、架空のECの注文一覧を提供するNode.js serverです。メモリ内のdomainを使い、保存方式を前提にしません。

## 起動

Node.js 22以上でrepository rootから実行します。

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-orders
npm run dev --workspace @loutrejs/example-graphql-orders
```

HTTPはhttp://127.0.0.1:3000/graphql、WebSocketはws://127.0.0.1:3000/graphqlです。PORTで変更できます。

## 注文一覧と取得戦略

150注文から先頭100注文を選び、各注文に2明細があります。ページ確定はdomain serviceが行います。EAGERは顧客と商品、HYBRIDは顧客を先読みし、LAZYは関連domainをField Builderのloadで取得します。3戦略の公開結果は同じです。

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query($strategy:Strategy!){ orders(strategy:$strategy,pagination:{offset:0,limit:100}){ totalCount pageInfo{hasNextPage} edges{id customer{account{name}} items{quantity product{name category{name}}}}}}","variables":{"strategy":"LAZY"}}'
```

strategyをEAGER / LAZY / HYBRIDへ変えて比較できます。別Queryの`{ productBatchCount }`で商品loadのBatch呼出しを前後に確認できます。EAGERでは追加loadは0です。Batch数は非同期の完了時刻や選択内容でも変わるため、常に1回とは保証しません。

## 読む順序

- [contracts/orders.graphql](./contracts/orders.graphql): 公開契約とdefault引数。
- [graphql.config.ts](./graphql.config.ts): domain mapping・Context・Resolver Moduleと生成先。
- [src/domain/commerce.ts](./src/domain/commerce.ts): ページング、先読み、Tenant / Revisionを含む複合キーでの取得。
- [src/graphql/resolvers.ts](./src/graphql/resolvers.ts): Generic Type引数なしのsource / field、requires、Authorization。
- [src/app.ts](./src/app.ts): manifestとDIの接続。
- [src/graphql/manifest.ts](./src/graphql/manifest.ts): 生成Schemaと手書きResolverのBinding。

GraphQLが公開しないproductId / tenant / revisionをOrderItemのdomainに持ちます。loadはParent順へ値を対応させ、同じ商品IDでもTenant / Revisionを混ぜません。authorizeは先読み値のreuseにも適用します。

```sh
npm run generate:check --workspace @loutrejs/example-graphql-orders
npm run typecheck --workspace @loutrejs/example-graphql-orders
```

[生成とData Resolutionのガイド](../../docs/graphql-codegen.md)にAPIとExecution Scopeをまとめています。Subscriptionの利用は[Counter server](../graphql-counter/README.md)を参照してください。
