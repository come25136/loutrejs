# GraphQLの生成とData Resolution

SDLを契約として共有し、CLIで型とRuntime Manifestを同じ入力から生成します。Applicationは生成したmanifestをendpointへ渡します。Resolver ModuleやDIをCLIから実行せず、Schema構築とResolver Bindingは生成Moduleの初期化時に一回行います。

```sh
npm install @loutrejs/loutre @loutrejs/graphql graphql
npm install --save-dev @loutrejs/cli
```

## 設定と生成

`graphql.config.ts`に静的なobject literalをexportします。type-only importとsatisfiesを使えます。関数呼出し・spread・value importは評価しません。JSON設定も同じtargets形式で利用できます。

```ts
import type { GraphQLCodegenConfig } from '@loutrejs/cli'

export default {
  targets: {
    server: {
      kind: 'server',
      schema: ['contracts/**/*.graphql'],
      resolvers: 'src/graphql/resolvers.ts',
      output: 'src/graphql/generated',
      contextType: '../context.js#AppContext',
      mappers: {
        OrderItem: '../../domain/order.js#OrderItem',
        Product: '../../domain/product.js#Product',
      },
    },
    client: {
      kind: 'client',
      schema: ['contracts/**/*.graphql'],
      documents: ['operations/**/*.graphql'],
      output: 'src/client/generated.ts',
    },
  },
} satisfies GraphQLCodegenConfig
```

schema / documents / resolvers / outputは設定fileからの相対pathです。contextType / mapperのimportは生成types.tsからの相対pathです。Resolver Moduleは`resolvers`をnamed exportします。serverの出力directoryは生成専用とし、client outputもその外へ置きます。

```sh
loutre graphql generate --config graphql.config.ts
loutre graphql generate --config graphql.config.ts --target server
loutre graphql generate --config graphql.config.ts --watch
loutre graphql generate --config graphql.config.ts --check
```

server targetはtypes.ts・data.ts・schema-ast.ts・manifest.tsを同一世代で生成します。client targetは名前付きOperation / FragmentのVariables・選択結果・TypedDocumentNodeを生成します。client projectには`@graphql-typed-document-node/core`も追加してください。

生成物には@generatedと入力指紋が付きます。全targetの生成・整形・検証とtemp出力を終えてから更新し、更新中の失敗では全targetを前の正常世代へ戻します。`--check`は書き込みません。watchはSDL・Operation・設定の追加 / 変更 / 削除を追跡し、エラー後の正常な世代を保持します。生成directoryへ人間のsource fileを置かないでください。Resolver実装の変更はApplicationの再起動 / HMRでBindingし直します。

## Domain MapperとScalar

mappersは公開GraphQL Typeとdomain Typeの対応です。例えばOrderItemのdomainはproductIdを持ち、SDLではproduct: Product!を公開できます。mappingは型生成だけへ適用し、RuntimeのObject変換や保存方法は決めません。同名のimportにはaliasが付きます。

contextType / mappersはserver専用です。Field BuilderのParent / Args / Result / ContextはSchemaFieldsから推論します。ArgsはGraphQLがcoerceした値で、Input Object内のdefault値も型へ反映します。

Custom Scalarはtargetごとにinput / outputを指定します。未指定のScalarをanyへ落としません。

```json
{ "scalars": { "DateTime": { "input": "Date", "output": "Date" } } }
```

clientでは通信上の表現に合わせてDateTimeをstringにします。serverではGraphQLScalarTypeのparse / serialize処理をresolversへ登録します。Union / Interfaceの`__resolveType`、Objectの`__isTypeOf`、Enumの値対応も同じResolver Moduleへ登録できます。生成時にdomain / context Moduleは実行せず、参照先の存在と型の整合性はTypeScript検査で確認します。

## ResolverとManifest

```ts
import { createData } from './generated/data.js'
import type { Resolvers } from './generated/types.js'

const d = createData()

export const resolvers = {
  Query: {
    orders: d.Query.orders.source(({ args, context, demand, signal }) =>
      context.orders.search({ ...args, demand, signal }),
    ),
  },
  OrderItem: {
    product: d.OrderItem.product.field({
      requires: ['productId'],
      load: async (items, { context, signal }) => {
        const products = await context.catalog.findByIds(
          [...new Set(items.map((item) => item.productId))],
          { signal },
        )
        return items.map((item) => {
          const product = products.get(item.productId)
          if (!product) throw new Error('Product not found')
          return product
        })
      },
    }),
  },
} satisfies Resolvers
```

通常のResolver / default property Resolverも使用できます。Query / Mutationのroot Fieldへresolve、Subscriptionへsubscribeとresolveを登録します。Data Builderの.source()はAsyncIterableを作るAPIではないため、Subscription Sourceには標準のsubscribe Resolverを使います。

```ts
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { manifest } from './generated/manifest.js'

export const endpoint = graphql.endpoint({
  name: 'Commerce',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: (
    orders = inject(OrderService),
    catalog = inject(CatalogService),
  ) => ({
    context: ({ signal }) => ({ orders, catalog, signal }),
  }),
})
```

manifestはOpaque Typeです。schema / typeDefs / rootValueをendpointへ渡す経路はありません。makeExecutableSchema()や手動prepareは不要です。生成manifestはResolverをvalue importします。Resolverからはgenerated/dataをvalue importし、generated/typesをtype-only importします。generated/manifestの値を逆importしないでください。data ModuleのimportだけではSchema構築やResolver Moduleのimportを開始しません。

## Read-throughとBatch

引数を持たないFieldは、Parentの同名own data propertyにundefined以外の値があれば再利用します。null / [] / false / 0 / ''もLoadedです。prototypeやgetterは自動readしません。

引数を宣言したFieldは省略呼出しでも自動reuseしません。先読みしたページ等との一致を明示readで確認します。

```ts
import { data } from '@loutrejs/graphql/data'

const posts = d.User.posts.field({
  requires: ['id'],
  read: ({ parent, args }) =>
    parent.postsPage?.first === args.first
      ? data.loaded(parent.postsPage.items)
      : data.missing,
  load: (users, { args, context, signal }) =>
    context.posts.findForUsers(users, { first: args.first, signal }),
  maxBatchSize: 100,
})
```

loaded(undefined)は拒否します。未取得のときだけrequiresを確認し、loadへ同じ順序のParent配列を渡します。loadは同じ要素数・順番でResultを返してください。内部キー欠落や要素数不一致はGraphQL Field Errorになります。

BatchはExecution Scope・Field Definition・coerced Argumentsで分類します。AliasやObject key順、default値の指定方法では分割しません。Date / Class Instance等の同値性が不明な引数は保守的に分離します。異なるSelectionも分離し、loadへselectionを渡します。同期的に集まった要求をMicrotask境界でflushし、maxBatchSizeで分割します。非同期に完了するParentでは複数Batchになることがあります。

同一Parent Objectの同一要求は処理中だけ共有できます。完了値や同一IDだけを根拠にしたEntity Cacheは持ちません。RepositoryではParentごとのTenant / Authorization / Revisionを保持し、必要なら複合キーで重複を除いてください。

## AuthorizationとExecution Scope

.field({ authorize })はread / reuse / loadより先に実行します。既存Resolverを包む場合は`data.authorize(resolver, check)`でMetadataを引き継げます。任意のwrapperがMetadataを失った場合、そのData Resolverの実行を拒否します。Sourceの先読みでもRepository側のAuthorizationを守ってください。

ScopeはHTTP / WebSocket QueryのOperationごと、Mutationのroot Fieldごと、SubscriptionのDelivery Eventごとに作ります。別HTTP Requestや同じWebSocket接続の並行OperationでもBatchを共有しません。手動scopeとAsyncLocalStorageは不要です。

Source / loadのsignalへHTTP Abort・WS complete / disconnect / drainを伝播します。外部I/Oもそのsignalに協調して停止してください。GraphQLのError Path・Non-null / List semantics・IntrospectionはGraphQL.jsへ委譲します。

## Demandと観測

.source()のdemandはField SelectionのTreeです。各NodeにparentType / fieldName / responseKeys / args / children / requires / prefetchableがあります。Alias、Fragment、Inline Fragment、skip / include、Variables、default引数、Interface / Unionの具体型を考慮します。__typenameへ内部依存を追加しません。defer / streamは明示的に拒否します。

Demandは先読みの判断材料です。SQL、Pagination、totalCount、Transaction / SnapshotはRepositoryが決めます。Partial Domain Valueの自動Hydrationは行わないため、子孫の不足をResolverが補えない場合は完全なdomain objectを返してください。

Operation Traceにはgraphql.data.field.reused_count、graphql.data.batch.call_count、graphql.data.batch.parent_count、graphql.data.batch.duration_msを集計します。Batch数やSQL数が常に1になる性能保証はありません。

## SDLの共有とCI

contract workspaceまたはversion付きSDL packageを共有し、利用versionをlockfileで固定します。利用側はOperationを記述してclient型を生成できるため、server実装完了を待つ必要がありません。

```sh
loutre graphql validate --schema 'contracts/**/*.graphql'
loutre graphql diff --before released/schema.graphql --after contracts/schema.graphql --json
```

diffは破壊的変更でexit code 1を返し、Enum値追加等のdangerous changeは別に報告します。認可やserviceの振る舞いはSchema差分だけでは保証できません。分割SDL / extendへ対応し、Federation / stitchingは行いません。

生成物をcommitし、CIで--check、TypeScript、Integration Testを実行してください。[Counter server](../examples/graphql-counter/README.md)、[注文server](../examples/graphql-orders/README.md)、[ADR](./adr/loutre_graphql_codegen_architecture.md)に実例があります。
