# ADR: GraphQL SDL / Codegen / Runtime Manifest / Data Resolution

- **Status:** Accepted（PR #112で実装・検証）
- **対象:** [Loutre PR #112](https://github.com/come25136/loutrejs/pull/112)
- **置換先:** `docs/adr/loutre_graphql_codegen_architecture.md`
- **関連:** `docs/adr/loutre_graphql_transport_architecture.md`
- **Backward Compatibility:** 要求しない。PR #112内のAPI・Generated Files・Execution FlowのBreaking Changesを許容する。
- **Terminology:** GraphQL / TypeScript / Framework固有の技術用語は原語表記に統一する（`Runtime Manifest`, `Opaque Type`, `Codegen`, `Schema`, `Resolver`, `Operation`, `Field`, `Execution Scope`, `Batch Scheduler`, `Selection Tree`, `Authorization`など）。日本語は説明文として使用し、原語に対応しない独自の和訳名を作らない。

## 1. Context

GraphQL SDLからResolver型だけをCodegenすると、Runtimeへ同じSDLを読み込む定型処理が残る。Static SchemaもCLIから生成し、生成物と人間が実装するResolverの接続をApplicationで明示する。また、GraphQLでネストしたデータを取得すると、次の3方式が混在する。

1. 親Resolverが内部キーを返し、子Resolverが関連データを取得する。
2. 親ResolverがJOINや先読みで子の値まで返す。
3. 親レコードが多数あり、子Resolverの個別I/OがN+1を起こす。

現行PR #112のように、SDL/Codegenと実行時Schema、手書きDataLoaderを別々に管理すると、整合性確認と定型実装が増える。

本ADRでは、**CLIによるGraphQLコンパイルを唯一の正規入口**とし、型定義・Static Schema・Resolver型を同じ入力から生成する。利用者が`bindManifest<AppContext>({ schemaDocument, resolvers })`を書き、ManifestをSchema・Resolver・Data Resolutionの接続点にする。複雑な業務検索やSQL戦略そのものはアプリケーションに残す。

代表例には架空のECサイトの注文一覧クエリを使用する。実在するアプリケーションやプロダクト固有のSchemaには依存しない。

## 2. Decision

### 2.1 CLI-generated SchemaとApplication-owned Binding

**`graphql.schema()`および`data.prepare()`は採用しない。** また、アプリ開発者に`makeExecutableSchema()`を呼ばせない。

```text
                   Build-time
schema.graphql ─────────────┐
                            ├── loutre graphql generate
config（paths, mappers）────┤             │
client operations ──────────┘             ├── generated/types.ts
                                          ├── generated/schema-ast.ts
                                          ├── generated/bindings.ts
                                          └── generated/client.ts （必要な場合）

                         Runtime Initialization / Workers Cold Start
resolvers.ts ──────┐
                   ├── Applicationのmanifest.ts
schema-ast.ts ─────┘       │
                           ▼
               bindManifest()（1回）
               ・GraphQLSchema construction
               ・Resolver binding
               ・Data Field metadata validation
                           │
                           ▼
                  GraphQL Runtime
                      │
             graphql.endpoint({ manifest })
                      │
               GraphQL Operation
                      │
                Selection Analysis / Batch Execution
```

- **型の生成**と**Static Schemaの生成**は同じCLI呼び出し、同じSDLを基準に行う。
- 生成物は**型だけでなく、Runtimeに必要なStatic Schema情報とResolver型**を含む。
- GraphQLSchemaはRuntime Initialization時に1回構築する。GraphQL.jsの`GraphQLSchema`インスタンス、Resolver関数、DI済みContextはJSONへ完全にserializeできないため、**Runtime Initializationが不要になるとは約束しない**。
- RequestごとにSDLのparse、Schema構築、Resolver定義のグローバル再走査を行わない。
- SQL/ORMのJOINや取得戦略はアプリケーションのRepositoryが選ぶ。
- GraphQL.jsの標準仕様（実行・型解決・エラー・null伝播・Introspection）は維持する。
- **Batch SchedulerのExecution ScopeはGraphQL Operationを基準**とし、Argumentsの分類はFramework内部で行う。Public APIに`argsKey`/`partition`は設けない（§7）。

### 2.2 Public API

正規の実行入口は`bindManifest()`が返すOpaque Manifestにする。

```ts
import { graphql } from '@loutrejs/graphql'
import { manifest } from './graphql/manifest.js'

graphql.endpoint({
  name: 'CommerceApi',
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

- `graphql.endpoint({ manifest })`をPublic APIのコントラクトとし、アプリ側から`schema`や`typeDefs`を渡す方式は廃止してよい。
- `manifest`のPublic Typeは **`Opaque Type`** とする。GraphQL SchemaとData ResolutionのCompiled Metadataを保持するが、アプリケーションは内部構造に依存せず`graphql.endpoint({ manifest })`を使用する。これはTypeScriptのAPI境界に関する方針であり、Runtime Objectの内部情報を一切参照できないという意味ではなく、Security Boundaryでもない。
- `@loutrejs/graphql/data`は`getFieldSelection(info)`と明示read用の`loaded` / `missing`を提供する。
- 通常のResolverはGraphQL標準の`resolve(parent, args, context, info)`を使う。Batch取得を行うFieldには`{ requires, read, load, authorize, maxBatchSize }`を直接書く。
- 型付き`bindManifest<AppContext>`と`Resolvers<AppContext>`がSDLとDomain MapperからParent / Args / Resultを推論する。FieldごとのGeneric Type指定は要求しない。

### 2.3 Generated Files and Circular Imports

```text
src/graphql/
├── schema.graphql               # 公開SDL
├── context.ts                   # ApplicationのContext
├── resolvers.ts                 # ResolverとBatch設定
├── manifest.ts                  # SchemaとResolverを接続
├── graphql.config.ts            # SDL/operations/mapper/outputの設定
└── generated/                   # CLI出力
    ├── types.ts                 # Resolver型。ContextはGeneric Type引数
    ├── schema-ast.ts            # SDL由来の静的AST
    └── bindings.ts              # Schema固有の型付きBinding helper
```

client targetの生成先は別途指定する。

```text
manifest.ts ───────► resolvers.ts ──(import type)──► generated/types.ts
          ├───────► generated/bindings.ts ──(import type)──► generated/types.ts
          └───────► generated/schema-ast.ts
```

生成ModuleはApplicationのResolverやContextをimportしない。Domain Mapperのtype-only importはDomainへの依存として残す。Schema ASTはResolver型やLoutre runtimeへ依存しない。

Resolverの位置が対象Fieldを表すため、Field Builderや手書きのField Identityを要求しない。利用者が同じField名を二度指定する仕組みを避け、Binding時にSchemaのFieldへBatch設定を結び付ける。Binding Moduleの値をResolverから逆importしない。

- `types.ts`にManifestやResolverのvalue importを含めない。
- 開発者は生成ディレクトリを手編集しない。生成ファイルへ`// @generated`を付ける。
- 型付きBinding helperは共通runtimeへ委譲する。TypeScriptがGeneric Type引数の部分的な推論をサポートしないため、Contextだけを指定できるSchema固有のhelperを生成する。

## 3. Build-time / Runtime Responsibility Boundaries

### 3.1 Build-time Compile

`loutre graphql generate --config graphql.config.ts`が実行する。

1. SDLファイルを読み込み、GraphQL仕様に従ってparse/validateする。
2. Custom Scalar、Input/Output型、Domain Mapper、Resolver型、`SchemaFields`（Fieldごとの`Parent` / `Args` / `Result` / `Context`）を生成する。
3. 標準Resolver型へSchema固有のBatch設定の型を組み合わせる。
4. `GraphQLSchema`を組み立てるための**Static Blueprint**（事前生成したAST・Type/Field情報）を生成する。
5. 生成ModuleへApplicationのimportや個別のBindingを含めず、ContextをGeneric Type引数で受け取る型付きBinding helperを生成する。
6. Client TargetがあればTypedDocumentNode/Variables/Result型を生成する。
7. 入力変更による生成差分を確定的に出力する（決定的な並び・原子的ファイル更新）。

**CLIはアプリケーションのResolver、Repository、DI Containerを実行しない。** CLIからは任意のTypeScript式中にある`requires: ['productId']`等の値を安全に評価できないため、これらをStatic Analysisのみで完全に取得できるとは仮定しない。

静的情報と動的情報は分ける。

| 取得可能な情報                                                         | 確定タイミング            |
| ---------------------------------------------------------------------- | ------------------------- |
| SDLの型、引数、nullability、directive定義                              | CLI生成時                 |
| Fieldごとの`Parent` / `Args` / `Result` / `Context`型とResolver型      | CLI生成時                 |
| 名前付きOperation / Fragment / client output型                         | CLI生成時                 |
| SchemaのField名                                                        | CLI生成時                 |
| Resolver関数の実体、Batch設定の`requires`、`read`、`load`、`authorize` | **Runtime Binding**       |
| GraphQL Operationの実際のVariables / Selections                        | **Operation Execution時** |
| 取得済み値、Batch Queue、snapshot、Abort                               | **Field Execution時**     |

### 3.2 Runtime Binding（アプリ起動時に1回）

Applicationの`manifest.ts`は、**起動時に生成SchemaとResolver Moduleをimportし、`bindManifest()`でData Resolver MetadataをSchemaのFieldへBindingする**。`bindManifest`は`@loutrejs/graphql/runtime`のPublic APIとする。CLI設定にResolver Moduleのpathは要求しない。

Applicationで記述するBinding:

```ts
// manifest.ts — Applicationが保守する。
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import type { AppContext } from './context.js'
import { resolvers } from './resolvers.js'

export const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers,
})
```

生成schemaDocumentはSDL由来のASTだけを持ち、ApplicationのContextやResolver型へ依存しない。Schema専用のbindings.tsがbindManifest helperをexportし、inline Resolverを生成Resolvers<Context>で型付けする。ApplicationがContextをGeneric Type引数として指定し、bindManifestからendpointまで型を引き継ぐ。CLI設定にcontextTypeは含めない。TypeScriptは一部のGeneric Type引数を明示したときに残りを推論できないため、Schemaを生成helperに固定する。helperはResolver Moduleをimportせず、利用者から受け取ったBindingを共通Runtimeへ委譲する。`schemaDocument`はSDL文字列ではなくCLIでparse済みのASTを静的モジュールとして生成する。Runtime Bindingで`buildASTSchema()`相当の処理とResolver Bindingを行う。**TypeScriptの型を実行時に反射する仕組みは導入しない。**

Runtime Bindは次を検証する。

- Schemaに存在しないFieldへのResolver bindingがないこと。
- 同じFieldへ競合するData Resolverが複数登録されていないこと。
- authorizeがBatch設定へ結び付けられ、先読み値の再利用にも適用されること。
- `requires`が対象domain型の生成型では型チェックでき、実行時もキー不在を明示的に検知できること。
- Custom Scalar、Abstract Type、Subscription Field等がGraphQL.jsの標準構築コントラクトを満たすこと。

Binding済みManifestは**Immutable**として扱う。Runtime Initialization後のResolver差し替えは行わず、変更時はCLI再生成/モジュール再ロードが必要。

### 3.3 Request-time Execution

OperationごとにGraphQL.jsがFieldを実行し、Data Layerは次のみ担当する。

- GraphQL SelectionからSelection Treeを組み立てる。
- Preloaded Valueを再利用する。
- Missing Fieldの取得要求を安全にBatchingする。
- Operation/Event単位のScopeで中断・統計を管理する。

Schema/Fieldの静的依存対応はRuntime Bindingで確定済み。Request-timeに全Resolverの再探索をしない。

## 4. SDL, Generated Types and Resolver Bindings

### 4.1 SDL-first

```graphql
type Query {
  orders(filter: OrderFilter!, pagination: PaginationInput!): OrderConnection!
}

type OrderConnection {
  totalCount: Int!
  pageInfo: PageInfo!
  edges: [Order!]!
}

type Order {
  id: ID!
  customer: Customer!
  items: [OrderItem!]!
}

type OrderItem {
  id: ID!
  quantity: Int!
  product: Product!
}

type Product {
  id: ID!
  name: String!
  category: Category!
}
```

`OrderFilter`、`PaginationInput`、`PageInfo`、`Customer`、`Category`の型定義は例の簡潔化のため省略。`OrderItem.productId`は内部キーであり、SDLへ公開する必要はない。

### 4.2 Schema固有のResolver型

Resolverの位置に応じてSDLとDomain Mapperから型を取得する。ApplicationのContextだけをGeneric Type引数で指定する。

```ts
// src/graphql/resolvers.ts — 人間が記述
import { getFieldSelection } from '@loutrejs/graphql/data'
import type { Resolvers } from './generated/types.js'
import type { AppContext } from './context.js'

export const resolvers = {
  Query: {
    orders: {
      resolve: (_parent, args, context, info) =>
        context.orders.search({
          ...args,
          selection: getFieldSelection(info),
          signal: context.signal,
        }),
    },
  },
  OrderItem: {
    product: {
      requires: ['productId'],
      load: async (items, { context, signal }) => {
        const ids = [...new Set(items.map((item) => item.productId))]
        const byId = await context.catalog.findByIds(ids, { signal })
        return items.map((item) => {
          const value = byId.get(item.productId)
          if (value === undefined) throw new Error('Product not found')
          return value
        })
      },
    },
  },
} satisfies Resolvers<AppContext>
```

`Parent`はDomain Mapperを指定したType、`Args`はSDLから生成したcoerced GraphQL Arguments、`Result`はDomain MapperとSDLのnullability/collection semanticsを反映したType、`Context`はApplicationがBindingまたはResolver型のGeneric Type引数で指定するType。`OrderItemDomain`はSDL非公開の`productId`を持つ。

```ts
// graphql.config.ts — Config APIは概念例
export default {
  schema: './schema.graphql',
  mappers: {
    OrderConnection: '../domain/order.ts#OrderConnectionDomain',
    Order: '../domain/order.ts#OrderDomain',
    OrderItem: '../domain/order.ts#OrderItemDomain',
    Product: '../domain/product.ts#ProductDomain',
  },
  output: './generated',
}
```

### 4.3 Generated Resolver Types

CLIが生成する`SchemaFields`の**概念型**。`FieldSpec`はRuntime値の定義ではなく、Resolverの型付けに使う型情報を表す。

```ts
// generated/types.ts — 概念型
export interface SchemaFields<Context extends object> {
  Query: {
    orders: FieldSpec<unknown, QueryOrdersArgs, OrderConnectionDomain, Context>
  }
  OrderItem: {
    product: FieldSpec<
      OrderItemDomain,
      Record<string, never>,
      ProductDomain,
      Context
    >
  }
}
```

生成した標準Resolver型と`SchemaFields<Context>`をmapped typeで組み合わせ、各Fieldに通常のResolverまたは`FieldOptions<Parent, Args, Result, Context>`を許可する。`requires`は`keyof Parent`、`load`の戻り値は`readonly Result[] | Promise<readonly Result[]>`へ制約する。`resolve`はGraphQL標準の引数形式を維持する。

```ts
export type Resolvers<Context extends object = object> = ResolverMap<
  StandardResolvers<Context>,
  Omit<SchemaFields<Context>, 'Subscription'>
>
```

Subscriptionのroot Fieldは標準の`{ subscribe, resolve }`で定義し、Batch設定を許可しない。`load`と`resolve` / `subscribe`は排他的にする。特殊なField Builderを挟まず、inline Bindingと分割Moduleの`satisfies Resolvers<AppContext>`の両方でContextual Typingを提供する。

### 4.4 Type Inferenceのルール

- Schemaに存在しない`OrderItem.unknownField`や`UnknownType`はTypeScript Error。
- `requires: ['productID']`のようなParent Domainに存在しないPropertyはTypeScript Error。`requires`の型チェックには対象TypeのDomain Mapperが必要。
- Non-null Fieldの`load()`は`null`を返せない。Nullable Fieldだけ`R | null`を許可。Runtimeデータは別途検証する。
- `read`の`loaded(value)`のValueと`resolve`のreturn valueも生成された`Result`型で制約する。
- 既存のStandard Resolver/Default Resolverとの混在を許可する。Runtime Binding時にResolverの配置からSchemaのFieldへ設定を結び付ける。
- アプリケーションから`manifest.ts`のvalueを逆importしてはいけない。
- Domain Mapper、Custom ScalarのInput/Output型、SDL nullability、GraphQLのListとElement nullabilityはSchemaFieldsの生成時に考慮する。

## 5. Read-through Field Resolution

### 5.1 Field Resolutionコントラクト

Batch設定は**ParentがChildをすでに持っている場合**と**内部キーしか持っていない場合**を同じ定義で扱う。

```text
GraphQL Field
   │
   ▼
Field Authorization
   │
   ▼
read（明示的 or Argumentsなしのown data propertyの自動判定）
   ├── loaded → その値を返す
   └── missing → requiresを検証 → Batch Scheduler → load(parents[])
```

```ts
type ReadResult<T> = { kind: 'loaded'; value: T } | { kind: 'missing' }

interface FieldOptions<Parent, Args, Result, Context> {
  requires?: readonly (keyof Parent)[]
  read?: (input: {
    parent: Parent
    args: Args
    context: Context
    info: GraphQLResolveInfo
  }) => ReadResult<Result>
  load: (
    parents: readonly Parent[],
    input: {
      args: Args
      context: Context
      signal: AbortSignal
      selection: FieldSelection
    },
  ) => Promise<readonly Result[]> | readonly Result[]
  // 引数の正規化とBatchの分離はExecution Scope側で自動管理する。
  maxBatchSize?: number
}
```

`load`は**親オブジェクト配列**を受け取り、同じ要素数と順番で値配列を返す。関係キーをMap化するか、複合キーで検索するかはRepositoryの自由。結果長不一致はField Error。

### 5.2 Reuse of Preloaded Values

- GraphQL Field Definitionが**引数を持たない**ときは、親の同名**own data property**が存在し値が`undefined`以外ならLoadedとみなす。プロトタイプやgetterを暗黙実行しない。
- `null`、`[]`、`false`、`0`、`''`はLoaded Value。
- Argumentsを定義したFieldは、呼び出し時に引数を省略していても自動再利用しない。`read`が引数・スナップショット・Authorization条件の一致を判定する。
- `read`の戻り値は `data.loaded(value)` または `data.missing`。`loaded(undefined)`は禁止する。
- PreloadedなParent ObjectがDescendant Fieldを全部持つ保証はない。不足した子孫を適切なResolverが補えない場合、resolveが完全なDomain Valueを返すコントラクトにする（v1は自動Partial Hydrationを行わない）。

```ts
// Schema上の User.posts(first: Int!): [Post!]! の例
const posts = {
  requires: ['id'],
  read: ({ parent, args }) =>
    parent.postsPage?.first === args.first
      ? data.loaded(parent.postsPage.items)
      : data.missing,
  load: (users, { args, context, signal }) =>
    context.posts.findForUsers(users, { first: args.first, signal }),
} satisfies NonNullable<Resolvers<AppContext>['User']>['posts']
```

### 5.3 Standard Resolver

`resolve(parent, args, context, info)`から`getFieldSelection(info)`を呼び、選択Fieldと内部依存情報をRepositoryへ渡す。関連データの先読み、検索条件、sort、totalCount、Pagination、TransactionはDomain/Repositoryが決める。ライブラリはSQLを作らない。

## 6. Selection Analyzer

### 6.1 Selection Tree

Runtime Manifestには、SDLのType/Field Definitionと Batch設定が宣言した内部依存情報が**結合済み**である。Operation Execution時のSelection Analyzerはこの情報を使ってSelection Treeを作る。

```text
Query.orders
├─ totalCount / pageInfo
└─ edges[]
   ├─ customer { id, account { id, name } }
   └─ items[]
      ├─ id, quantity
      └─ product { id, name, category { name } }
           ↳ OrderItem内部に productId が必要
```

| 種類           | 意味                                           |
| -------------- | ---------------------------------------------- |
| `Selected`     | Clientが要求したPublic Field                   |
| `Required`     | 取得のためParent Domainで必要な内部キー等      |
| `Prefetchable` | Resolverが先読みを検討できる関連。必須ではない |

### 6.2 Selection Normalization

- Schema/ASTの解析はGraphQL.jsのValidation/Input Coercionを尊重する。
- Alias、Fragment Spread、Inline Fragment、`@skip`、`@include`、Variables、Default Argumentsを処理する。
- Response KeyとSchema Field Nameを区別する。同じFieldでもArgumentsが異なるなら別選択Field情報。
- Interface/Unionは実行可能な具体型を考慮し、不要な型依存の内部キーを決め打ちしない。
- `__typename`のために別DBアクセスを要求しない。
- Custom Resolverで未宣言のField Dependenciesを推測しない。対応できないResolverでは完全なDomain Object取得へフォールバックする。
- `@defer`/`@stream`等の実行モデルをv1で未サポートとする場合は、黙って無視せず明示的に拒否する。

`Required`のキーはDB Column名と同一である必要はない。Repositoryが論理キーからDBカラム・JOIN・API呼び出しを選ぶ。必要な内部キーをResolverが返していなければ、`load`前に明確なField Errorとする。

## 7. Batch Scheduler / Execution Scope

### 7.1 Batch Grouping

Batch GroupingはLoutre内部で次のキーから決定する。**Public APIに`argsKey`や`partition`を設けない。**

```text
Batch Group = Execution Scope + Field Definition + Normalized Arguments
```

- ArgumentsはGraphQL.jsがcoerceした値（省略・デフォルト値を含む）をもとに、**Loutreが自動的に正規化**する。ObjectのKey順では結果を変えず、意味の異なる引数を同一視しない。FieldのAliasだけでBatchを分割しない。
- 任意のCustom Scalarが返すDate/Class Instance等について、同値性を安全に判定できない場合は**異なる要求を無理にまとめない**（保守的なグループ分離）。ユーザー定義の`argsKey`を要求しない。この場合Batch効率が下がることは許容する。
- 同期的に集まった要求をMicrotask境界でflushする。親が非同期に完了する場合は**複数Batchになり得る**。
- `maxBatchSize`を超える場合は分割し、元のParent入力順と戻り値の対応を維持する。
- `load`がSelectionに依存してPartial Valueを返す場合、**互換性のないSelectionを同じBatchへ統合しない**。安全に比較できない要求は保守的に分割する。通常の`load`はSelectionにかかわらず正しく解決できる値を返す。
- 同一Operationの`load`へ複数のParent Objectが渡されることはある。**同じIDでもテナント・Catalog Revision・Authorization条件が異なれば結果を共有してはいけない。** `load`/RepositoryがParentごとにAuthorization・Revision条件を扱い、必要なら内部で検索を分ける。Batch GroupingはAuthorizationの代わりではない。
- 初期版は**完了済み値のPersistent Cacheなし**。安全な範囲のIn-flight Deduplicationに留め、Global Entity Cacheは持たない。同一IDだけを根拠に別のParentの値を自動共有しない。
- `load`の結果数不一致や例外は該当GraphQL Field Errorとして扱う。
- SQL数やBatch数が絶対1回になることは保証しない。

### 7.2 Execution Scope Boundaries

| 経路・Operation        | Execution Scope                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| HTTP Query             | GraphQL Operationごと。**異なるHTTP Request間で共有しない**                                   |
| HTTP Mutation          | **root mutation fieldごと**。副作用を跨ぐ取得済み結果を共有しない                             |
| WebSocket Query        | WebSocket接続ではなく**GraphQL Operationごと**。同一接続で複数Operationが並行しても共有しない |
| WebSocket Mutation     | OperationおよびRoot Mutation Fieldごと                                                        |
| WebSocket Subscription | **Delivery Eventごと**。Subscription lifetime全体で共有しない                                 |

HTTPで1 Requestから複数Operationを処理できる実行経路がある場合でも、Operation間で共有しない。単一のWebSocket接続やAuthentication SessionもScopeの共有理由にならない。**発行元が別なら当然分離し、同じ発行元でもOperationが異なれば分離する。**

Resolver定義はModule lifetime、Batch QueueはExecution lifetime。DIのService lifetimeと混同しない。

アプリに手動`data.scope()`を要求せず、GraphQL Execution Adapterが内部Execution Scope/Context Viewを管理する。グローバル`AsyncLocalStorage`へ依存しない構成とし、Node/Bun/Deno/Workersで同じ境界を保証する。

### 7.3 Subscription

既存の`graphql.subscribe()`へ長寿命の`contextValue`を一括委譲するだけでは、Event単位のExecution Scope分離を保証できない。破壊的変更を認めるため、GraphQL.jsのSource Event取得とEventごとの標準実行を分離するアダプターを設ける。

1. Subscribe時にGraphQL.js標準のSubscription Source `AsyncIterable`を得る。
2. Source Eventごとに**新しいExecution Scope/context view**を作る。
3. GraphQL.jsの標準的なEvent Executionを行い、結果をGraphQL-WSへ流す。
4. complete/disconnect/drainではiterator cleanup（`return()`）、Abort、Operation Trace終了を保証する。

GraphQL.js v16/v17での公開API差異は**両バージョンのconformance test**で確認する。標準GraphQL実行の意味論を独自実装で置き換えない。

## 8. Authorization, Data Consistency and Errors

- Field AuthorizationはPreloaded Valueを再利用する場合にも適用し、**authorize → read/reuse → load**の順序を守る。
- resolveによる先読みもアクセスであり、RepositoryはTenant/Authorization条件を守る。Field Authorizationに任せて権限外の情報を過剰取得しない。
- 同一Operation内のデータ一貫性が必要なドメインでは、Transaction SnapshotやCatalog RevisionをresolveからChild FieldのBatchへ引き継ぐ。LoutreはTransactionを強制開始しない。
- CancellationはresolveとBatchへ`AbortSignal`として伝播する。中断後は新規Batchを実行しない。
- GraphQLのNon-Null ViolationやError PathはGraphQL.jsの標準結果に委譲する。内部エラーへ認証情報やSQL生データを混ぜない。

## 9. Conformance Fixture: Order List

以下は**架空の例題**。実在のデータや性能値は前提としない。

```graphql
query OrdersWithDetails($filter: OrderFilter!, $pagination: PaginationInput!) {
  orders(filter: $filter, pagination: $pagination) {
    totalCount
    pageInfo {
      hasPreviousPage
      hasNextPage
      __typename
    }
    edges {
      id
      customer {
        id
        account {
          id
          name
          __typename
        }
        __typename
      }
      items {
        id
        quantity
        product {
          id
          name
          category {
            name
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}
```

Fixtureでは`pagination = { offset: 0, limit: 100 }`、1注文あたり明細2件（200明細）を仮定する。

1. `orders()`のDomain/Repositoryが**100注文のページ**、総件数、並び順を確定する。1:N JOIN後にLIMITをかけ、ページ意味論を壊さない。
2. resolveが顧客・商品までEagerに返す場合、Child Fieldの追加`load`は0回。
3. resolveが`productId`まで返す場合、`OrderItem.product`が未取得分をBatchで解決する。
4. 顧客のみEager、商品はLazyでも、**最終GraphQLレスポンスは一致**する。
5. 同じ商品IDを複数明細が参照していても、可能ならRepositoryで重複排除。ただし異なるCatalog Revisionを混ぜない。

`load`が1回になるとは断定しない。計測対象はDBラウンドトリップだけでなく、DB execution、ORM/decode、GraphQL execution、HTTP全体時間を区別する。

Operation Traceには`graphql.data.field.reused_count`、`graphql.data.batch.call_count`、`graphql.data.batch.parent_count`、`graphql.data.batch.duration_ms`などをOperation単位で集計する。注文IDや顧客情報は原則High CardinalityのTrace属性へ入れない。

## 10. CLIコントラクトとCodegen Quality

正規CLIは**`loutre graphql generate`**。`graphql.schema()`は不要。

```bash
loutre graphql generate --config graphql.config.ts
loutre graphql generate --config graphql.config.ts --check
loutre graphql generate --config graphql.config.ts --watch
```

- `server` targetは`types.ts`＋`schema-ast.ts`＋`bindings.ts`を**整合した1世代として**生成する。`client` targetが指定された場合はOperation/Fragmentの型とdocumentを追加生成する。
- CLIの設定でSDL paths、Domain Mapper、Custom Scalar、Operation paths、出力先を宣言する。
- CLIによる生成はdeterministic。同時出力の整合性は原子的更新で守り、`--check`は生成済み内容全体との差分を検出する。入力ハッシュを持たせる必要はない。
- 生成に失敗した場合は、`types.ts`だけ新しい／`schema-ast.ts`・`bindings.ts`だけ古い状態を作らない。temp出力→全ファイル検証→原子的更新を基本にする。
- `--watch`は入力の変更を監視して正しい世代へ更新し、直前の正常出力を保護する。Resolver実装コードの変更がMetadataに影響するときはアプリのHMRまたは再起動時に再Bindingする。
- SDLのunknown type、operation/fragmentの不正、scalar mapper不足は生成時エラー。
- Runtime Bindingで初めて判明するResolver Metadata不整合は**起動時エラー**。CLIが任意のTypeScript関数の意味を理解できると仮定しない。
- Domain Mapperは型生成設定であり、Runtimeの自動Object Mapperではない。
- CLIはアプリケーションRepository/DIやResolver関数を実行しない。

### Cloudflare Workers / Other Runtimes

- 生成済みManifestは静的ESMとしてバンドル可能であること。Runtimeはファイルシステム、Node専用API、動的Schemaファイル読み込みに依存しない。
- ASTを事前生成するため、**Cold Start時のSDL parseは省略できる**。ただしGraphQLSchemaの構築とResolver Bindingの初期化コストは残り得る。
- `manifest`はモジュール単位で再利用できるが、実行時のScope/Batch状態は各Operation/Eventに閉じる。
- Node/Bun/Deno/Workersで同じGraphQLとData Resolutionの動作をテストする。

## 11. Rejected Alternatives

| 代替案                                                  | 採用しない理由                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `graphql.schema({ typeDefs, resolvers })`をアプリで呼ぶ | CLI生成と起動時Schema組立が二重の入口になる                                |
| `data.prepare()`を後から呼ぶ                            | Metadataの結合順序をアプリへ要求し、取りこぼしを生む                       |
| 利用者が`data.field<P, A, R>()`をFieldごとに呼ぶ        | Domain Mapper/Schemaの生成情報を繰り返し指定し、誤記や型不整合を招く       |
| 全てを単一JSON Manifestとしてシリアライズ               | Resolver関数・DI・GraphQLSchemaインスタンスを保持できない                  |
| TypeScript ASTをCLIで実行/推論して`requires`を確定      | 任意のresolver式を静的に確定できず、CLIの安全性と再現性を損なう            |
| Runtime専用Manifestとは別に型生成パイプラインを持つ     | SDLとの整合性を保証しにくい。共通CLIで同一世代生成する                     |
| 完全なGraphQL Query Planner / SQL generator             | LoutreをORM化し、複雑なドメイン検索を壊しかねない                          |
| Entity Store / persistent result cacheを初期版で実装    | Authorization・データ版・部分投影の複雑さが増える。Batchのみを先に保証する |
| 全フィールドにData Resolverを必須化                     | GraphQL.jsの標準property Resolverの利点を失う                              |

## 12. Implementation Order（PR #112）

1. **CLI / Manifest形式:** `types.ts`・`schema-ast.ts`・`bindings.ts`の同一世代生成、config/API、生成の原子性・`--check`・watch。
2. **Resolver型:** `SchemaFields`、標準resolve / loadのType Inference、Domain Mapper/Context/Custom Scalar/nullableのType Test。
3. **Runtime Binding:** ManifestからGraphQLSchemaを1回構築し、Standard Resolver / Data Resolverを結合・検証。`graphql.endpoint({ manifest })`を正式入口にする。value import循環を防ぐ。
4. **Read-through / Batch:** `read`、`requires`、`load`、引数の自動正規化、Execution ScopeによるBatchの分離・中断・Authorization。
5. **選択Field情報:** AST・fragment・alias・abstract type・引数の正規化。Manifest Metadataと結合。
6. **Operation Scope:** HTTP Query、Mutation Root、WS Query/MutationとSubscription Event境界。GraphQL.js 16/17互換性検証。
7. **Example / 運用:** 既存GraphQL exampleを新Manifest入口へ変更し、100注文・200明細fixture、Trace、Node/Bun/Deno/Workersテストを追加。

別PRへ分割せず、PR #112内で仕様を一貫して成立させる。

## 13. Acceptance Criteria

| ID  | 条件                                | 合格基準                                                                                                               |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| M01 | 生成CLI                             | `generate`が`types.ts`・`bindings.ts`・Static Schemaの整合した世代を生成                                               |
| M02 | 正規Runtime入口                     | `graphql.endpoint({ manifest })`でHTTP/WSを提供し、`graphql.schema()`を要求しない                                      |
| M03 | Circular Import                     | `manifest → resolvers`のvalue importと`generated/types`へのtype-only importでESM初期化時の循環障害がない               |
| M07 | Type Inference                      | `OrderItem.product.load`と`Query.orders.resolve`で`Parent` / `Args` / `Result` / `Context`をGeneric Type指定なしで推論 |
| M08 | Invalid Field / Requires            | 存在しないType/Fieldや`requires`の誤字をTypeScriptが拒否                                                               |
| M09 | Non-null / Resolver Result          | Non-null Fieldのnull、誤った`load` / `resolve` ResultをTypeScriptが拒否                                                |
| M04 | SDL不整合                           | invalid SDLと型/Field登録の不一致を生成時または起動時に失敗させる                                                      |
| M05 | Custom scalar/mapper                | server/clientの型とRuntime scalarが一致し、型検査が通る                                                                |
| M06 | 静的Blueprint                       | requestごとにSDL parseやSchema buildが発生しない                                                                       |
| D01 | 親が内部キーだけ返す                | `load`がキーを使って子を解決する                                                                                       |
| D02 | 親が子を先読み                      | 引数なしFieldは追加`load`なし、null/空配列も再利用                                                                     |
| D03 | 引数付き先読み                      | args一致の明示`read`だけ再利用する                                                                                     |
| D04 | 大量親                              | 同じScope・Field・引数の取得を集約し、個別N+1呼び出しを抑える                                                          |
| D05 | 異なるalias/fragment/abstract type  | 選択Field情報が正しく分離・結合される                                                                                  |
| D08 | GraphQL引数の自動正規化             | オブジェクトキー順、default引数、aliasの違いで不必要に分割せず、異なる引数は混同しない                                 |
| D09 | 同値性が不明なCustom Scalar         | 無理に統合せず安全に別Batchへ分離できる                                                                                |
| D10 | 同一Operation内で権限・版の異なる親 | Batch内で親単位のAuthorization・版条件を保持し、関連レコードを混同しない                                               |
| D06 | 必要内部キーの欠落                  | 誤応答を返さずField Errorにする                                                                                        |
| D07 | AuthorizationとSnapshot             | 先読み/遅延の双方でAuthorizationを守り、データ版を混合しない                                                           |
| E01 | Mutation                            | root間の副作用を跨ぐbatch/in-flightを共有しない                                                                        |
| E02 | Subscription                        | イベントA/BでScopeを分離し、古い結果を再利用しない                                                                     |
| E07 | 異なるHTTPリクエスト                | 同じ引数・FieldでもBatch Schedulerを共有しない                                                                         |
| E08 | 同一WebSocket接続の複数operation    | Operation単位でBatch Schedulerを分離する                                                                               |
| E03 | Cancellation                        | HTTP Abort、WS complete、disconnect、drainでcleanupする                                                                |
| E04 | Runtime Compatibility               | GraphQL.js 16/17、Node/Bun/Deno/Workersの統合テストを通す                                                              |
| E05 | 注文fixture                         | Eager/Lazy/Hybridの3戦略が同じGraphQL結果を返す                                                                        |
| E06 | トレース                            | Operation単位でreuse/batch/時間を観測できる                                                                            |

本ADRは設計を決めるものであり、**実測性能保証ではない**。受入判定はType Test・GraphQL.js conformance・fixtureによる実行/結果一致・性能計測を組み合わせる。

## 14. Type Inferenceと実行の検証

Public Type Testで標準Resolverと直接書いたBatch設定のContextual Typingを検証する。Parentの内部キー、coerced Args、Custom Scalar、nullability、loadの配列要素を確認し、不正なType / Field、requires、戻り値、resolve / loadの併用はNegative Type Testへ含める。

Runtime TestではBatchの順序・分割、先読み値の再利用、authorizeの先行実行、選択Field情報、Mutation / Subscription Scope、並行Operationの分離と中断を確認する。公開tarballを使う独立consumerでGraphQL.js 16 / 17の生成・型チェック・HTTP / WebSocket実行を検証する。

## 15. Consequences and Open Questions

入力の業務制約はApplication / domainの責務とし、Zod等の検証手段をFrameworkが置き換えない。公開するエラー詳細やログ方針もApplicationが決め、RuntimeはHTTP / WebSocket共通の任意のformatErrorを提供する。GraphQLのdata・path・nullabilityとTransportの終了規約は維持する。

### Benefits

- **SDLを唯一のSchema情報源**にし、型とRuntime Manifestを同時生成できる。
- `graphql.schema()`なしで、Binding済みManifestをRuntimeの正式な引数にできる。
- Resolverの動的Metadataは起動時の1回のbindingへ集約できる。
- 生成Resolver型がParent / Args / Resultを推論し、ApplicationのContextだけを型引数で指定できる。
- Eager / Lazy / Batchを同じGraphQL Field Definitionで扱える。
- Static Schema処理をリクエストごとに繰り返さず、Workersへの静的バンドルが可能になる。

### Trade-offs and Unresolved Details

- 生成物が複数ファイルになるため、atomic generation、watch/HMR、Resolver Import順序の管理が必要。
- Schema ASTからGraphQLSchemaを作るため、**起動時初期化は残る**。ManifestはGraphQLSchemaの完全な事前シリアライズではない。
- `requires`の実際の値をCLIが全て静的抽出するわけではない。Generated Typesによる`keyof Parent`チェックと、Batch設定のRuntime Bindingによる検証を併用する。
- Mutation Root単位とSubscriptionイベント単位のScopeを、GraphQL.js v16/v17で安全に切る実行アダプターの詳細は実装検証が必要。
- Field Authorizationの公開APIと、Custom Scalar引数やselection-dependent `load`を保守的に分割する内部アルゴリズムは、実装時のconformance testで確定させる。`argsKey`と`partition`の公開APIは導入しない。

**最終判断**：PR #112では、**「CLIでSchemaとResolver型を生成し、Applicationが型付きBindingで接続する」**方式を採用する。LoutreはSchema構築をアプリへ要求せず、Schemaの静的構造をビルド時に、Resolver関数とData Metadataを起動時に、要求に応じたSelection/BatchをOperation実行時に扱う。

---

参考：[Loutre PR #112](https://github.com/come25136/loutrejs/pull/112)。このADRの注文例は架空の検証fixtureである。
