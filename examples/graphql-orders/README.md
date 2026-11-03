# GraphQL Orders Example

This Node.js server serves order listings for a fictional online store using handwritten bindings and generated Resolver types. It uses an in-memory domain model without assuming a particular persistence mechanism.

## Run the Server

Use Node.js 22 or later and run these commands from the repository root.

```sh
npm ci
npm run build
npm run generate --workspace @loutrejs/example-graphql-orders
npm run dev --workspace @loutrejs/example-graphql-orders
```

HTTP is available at http://127.0.0.1:3000/graphql and WebSocket at ws://127.0.0.1:3000/graphql. Set `PORT` to change the port.

## Order Listings and Loading Strategies

The domain service selects the first 100 of 150 orders, with two line items per order. The domain service determines pagination. EAGER prefetches customers and products, HYBRID prefetches customers, and LAZY fetches related domain objects through field `load` functions. All three strategies produce the same public result.

```sh
curl http://127.0.0.1:3000/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query($strategy:Strategy!){ orders(strategy:$strategy,pagination:{offset:0,limit:100}){ totalCount pageInfo{hasNextPage} edges{id customer{account{name}} items{quantity product{name category{name}}}}}}","variables":{"strategy":"LAZY"}}'
```

Change `strategy` to EAGER, LAZY, or HYBRID to compare them. In a separate Query, check `{ productBatchCount }` before and after to count product-loading batch calls. EAGER requires no additional loads. Batch counts also depend on asynchronous completion timing and field selection, so a single batch is not guaranteed.

## Suggested Reading Order

GraphQLのContext・Resolver・manifest・接続設定は`src/graphql/endpoint.ts`、生成物は`src/graphql/generated/`、公開URLは`src/http/contract.ts`、業務サービスは`src/domain/`へ置きます。Moduleへ渡すpathを変えても、HTTP Contractがルートの正本です。

- [contracts/orders.graphql](./contracts/orders.graphql): Public contract and default arguments.
- [graphql.config.ts](./graphql.config.ts): SDL, domain mapping, and generated output paths.
- [src/domain/commerce.ts](./src/domain/commerce.ts): Pagination, prefetching, and lookups keyed by a composite including Tenant and Revision.
- [src/http/contract.ts](./src/http/contract.ts): 公開pathを持つHTTP Contractを作成します。
- [src/graphql/endpoint.ts](./src/graphql/endpoint.ts): Context・Resolver・manifestと、Contractのルート参照・DI・HTTP／WSの設定をまとめます。
- [src/app.ts](./src/app.ts): Module・Provider・Executionを組み立てます。

The OrderItem domain model contains `productId`, `tenant`, and `revision`, which are not exposed through GraphQL. `load` aligns values with the Parent order and never mixes different Tenant or Revision values, even for the same product ID. `authorize` also applies when reusing prefetched data.

```sh
npm run generate:check --workspace @loutrejs/example-graphql-orders
npm run typecheck --workspace @loutrejs/example-graphql-orders
```

See the [Generation and Data Resolution Guide](../../docs/graphql-codegen.md) for the API and Execution Scope. For Subscriptions, see the [Counter server](../graphql-counter/README.md).
