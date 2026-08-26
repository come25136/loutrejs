<p align="center">
  <img src="./docs/assets/loutre.png" alt="Loutreのカワウソアイコン" width="180">
</p>

<h1 align="center">Loutre</h1>

<p align="center">
  明示的なApplication Graphから、型安全でポータブルなアプリケーションを構築する<br>
  Graph-firstのTypeScriptフレームワーク
</p>

<p align="center">
  <a href="#特徴">特徴</a> ・
  <a href="#クイックスタート">クイックスタート</a> ・
  <a href="#対応ランタイム">対応ランタイム</a> ・
  <a href="#コントリビューション">コントリビューション</a>
</p>

> [!WARNING]
> Loutreは現在開発初期の実験的なプロジェクトです。Public APIは安定しておらず、
> バージョン間で予告なく変更される可能性があります。

## Loutreとは

Loutreは、Contract、Module、Provider、Pipeline、Controllerの関係を明示的な
Application Graphとして表現するTypeScriptアプリケーションフレームワークです。
Graph Engineがruntime descriptorとGraph ProbeからGraphを構築・検証し、同じapplication modelをNode.js、Bun、Deno、
Cloudflare Workers、AWS Lambda、Electronなどのランタイムへ接続します。

```text
Contract → Protocol decode → ordered Pipeline → Controller
         → output validation → Protocol serialization
```

Filesystem規約やruntime reflectionに依存せず、依存関係、実行順序、Contextの変化を
コードとGraph diagnosticsから追えることを目指しています。

## 特徴

- **Graph-first** — runtime descriptorとlifecycleを実行しないGraph Probeからversion付き
  Application Graphを生成し、binding、coverage、pipeline順序、DIを一つのvalidatorで検証
- **Contract-first** — 入出力schema、response variant、protocolごとのwire modelを
  Contractに集約
- **型付きPipeline** — `requires` / `provides`でLayer間のContext変化を表現し、
  Controllerが受け取る最終Context shapeを導出
- **Factory Implementation** — HTTPとMessagePortの実装をprotocol-neutralなdescriptorと
  同期factoryで宣言し、`ctx`とresultをContractから自動推論
- **明示的なDI** — class、typed token、`application` / `transient` scope、
  parameterized Module、conditional Provider、`inject()` dependency edgeに対応
- **Schema相互運用** — Standard Schema互換のvalidatorを利用可能
- **マルチランタイム** — application codeを保ったまま、adapterを介して複数の
  JavaScript runtimeへ展開
- **複数protocol** — HTTPとMessagePortを備え、unaryおよびserver streamingに対応
- **構造化ログ** — 開発向けのカラー表示とログ収集向けのJSON Linesに対応

## クイックスタート

現在、各packageはnpmへ公開していません。まずはこのリポジトリに含まれるサンプルを
実行してください。Node.js 26.xが必要です。

```sh
git clone https://github.com/come25136/loutrejs.git
cd loutrejs
npm install
npm run dev --workspace @loutrejs/example-hello-http
```

別のターミナルからリクエストします。

```sh
curl http://127.0.0.1:3000/greetings/Loutre
```

```json
{ "message": "こんにちは、Loutre！" }
```

最小構成のapplicationは
[`examples/hello-http/src/app.ts`](./examples/hello-http/src/app.ts)で確認できます。

### HTTP path parameterとroute identity

HTTP pathのparameterは、schemaを宣言しなくてもControllerで`string`として型付けされます。

```ts
http({
  method: 'GET',
  path: '/users/{id}',
  responses: {
    found: { status: 200, body: User },
  },
  pipeline: [http.controller],
})

// Controllerではctx.params.id: string
```

Controllerはclassではなく、`implementation()`の同期factoryが返すplain objectとして定義します。
`contract`、`protocol`、`procedures`はfactoryを実行しなくてもGraphから参照できます。

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UsersService)) => ({
    get(ctx) {
      return ctx.response.found({
        body: users.get(ctx.params.id),
      })
    },
  }),
})

const UsersModule = defineModule(() => ({
  providers: [UsersService],
  implementations: [UsersController],
}))
```

値の検証や変換が必要な場合、`request.params`へobject schemaではなくpropertyごとの
schema mapを指定します。schema mapのkeyはpath parameterのkeyと完全に一致する必要があり、
各schemaはdecode後の`string`を入力できなければなりません。

```ts
http({
  method: 'GET',
  path: '/users/{userId}/posts/{postId}',
  request: {
    params: {
      userId: z.coerce.number(),
      postId: z.string().min(1),
    },
  },
  responses: {
    found: { status: 200, body: Post },
  },
  pipeline: [authLayer, validate.params, http.controller],
})
```

`request.params`の宣言だけでは型は変わりません。`validate.params`より前はraw
`string`、通過後はpropertyごとのschema outputになります。validationは自動実行されず、
schema mapはproperty単位のvalidationと変換だけを扱います。parameter間の関係や
cross-field validationはLayerまたはdomainで処理します。

HTTP routeのidentityは、methodを大文字化し、path parameter名を`{}`へ正規化して作ります。
たとえば`GET /users/{id}`と`get /users/{userId}`はどちらも
`http:GET:/users/{}`であり、同一routeとして拒否されます。同一Contractでは型検査と
`contract()`実行時、別Contract間ではApplication Graph compile時に重複を検出します。
dispatch時は登録順ではなくsegmentを左から比較し、static segmentをparameter segmentより
優先します。

### サンプル

| サンプル                                                   | 内容                                                             | 起動コマンド                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Hello HTTP](./examples/hello-http)                        | path parameter検証、callable Layer、factory DI、型付きController | `npm run dev --workspace @loutrejs/example-hello-http`                |
| [Basic認証](./examples/basic-auth)                         | `basicAuth()`、authentication Layer、HTTP 401                    | `npm run dev --workspace @loutrejs/example-basic-auth`                |
| [Bearer認証](./examples/bearer-auth)                       | ユーザー定義認証Layer、Context Key                               | `npm run dev --workspace @loutrejs/example-bearer-auth`               |
| [Database Transactions](./examples/database-transactions)  | DB不要のApplication定義transaction、custom token、再帰Pipeline   | `npm run dev --workspace @loutrejs/example-database-transactions`     |
| [PostgreSQL Database](./examples/database-postgres)        | `pg`の`PoolClient`をtyped Contextへ渡すtransaction Layer         | `npm run dev --workspace @loutrejs/example-database-postgres`         |
| [Drizzle PostgreSQL](./examples/database-drizzle-postgres) | Drizzle固有transaction clientとoptionを保持するLayer             | `npm run dev --workspace @loutrejs/example-database-drizzle-postgres` |
| [Prisma PostgreSQL](./examples/database-prisma-postgres)   | Prisma 7 interactive transactionとtyped Context                  | `npm run dev --workspace @loutrejs/example-database-prisma-postgres`  |

## CLI

CLIはfilesystem discoveryを行いません。buildやserver起動ではentry fileを明示します。

```sh
npx loutre check --entry fixtures/http-crud/src/app.ts
npx loutre doctor node --entry fixtures/http-crud/src/app.ts
npx loutre graph contracts --entry fixtures/http-crud/src/app.ts
npx loutre graph di --entry fixtures/http-crud/src/app.ts --format json
npx loutre graph modules --entry fixtures/http-crud/src/app.ts --format mermaid
npx loutre explain UsersController --entry fixtures/http-crud/src/app.ts
npx loutre build fixtures/http-crud/src/app.ts --out-dir dist/loutre
npx loutre start fixtures/http-crud/src/app.ts --port 3000
```

通常classとcustom tokenのdependencyは、constructor default parameterで宣言します。

```ts
class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

`inject()`はframework-managedな同期construction中だけ利用でき、class、Layer factory、Implementation factoryのRuntime解決および
Graph Probeによるdependency edge収集のsource of truthになります。DI constructionは同期で、
非同期resourceの初期化と終了はLifecycle hookへ分離します。

## Layerとchild Pipeline

LayerはContextと`next`を受け取り、Pipelineのcontinuationを包みます。`provides`があるLayerは
`next({...})`でContextを追加します。Layer自体を関数として呼ぶと、その利用箇所だけにchild
Pipelineを関連付けられます。

```ts
const transactionLayer = layer({
  name: 'transaction',
  factory:
    (database = inject(Database)) =>
    async (_ctx, next) => {
      await database.transaction(next)
    },
})

const pipeline = [
  transactionLayer([authorization, validate.body, http.controller]),
]

void pipeline
```

`transactionLayer`をそのまま置いた場合、`next()`は親Pipelineの残りを実行します。
`transactionLayer([...])`では`next()`がchildだけを実行し、Layerがreturnした後に親後段へ戻ります。
childで追加されたContextとvalidation stateは親後段にも残ります。Database接続、transaction client、
ORM固有optionなどはApplication側のProviderとLifecycleが管理し、Loutreはそれらを抽象化しません。

ContextをprovideするLayerは次のように定義します。

```ts
const authLayer = layer({
  name: 'auth',
  provides: [CURRENT_USER],
  factory:
    (users = inject(UsersService)) =>
    async (_ctx, next) => {
      const currentUser = await users.current()
      await next({ currentUser })
    },
})
```

## 対応ランタイム

| ランタイム                   | Adapter                      | Conformance test        |
| ---------------------------- | ---------------------------- | ----------------------- |
| Node.js 26.x                 | `@loutrejs/runtime-node`     | `npm run test:node`     |
| Deno                         | `@loutrejs/runtime-deno`     | `npm run test:deno`     |
| Bun                          | `@loutrejs/runtime-bun`      | `npm run test:bun`      |
| Cloudflare Workers / workerd | `@loutrejs/runtime-workerd`  | `npm run test:workerd`  |
| Electron                     | `@loutrejs/runtime-electron` | `npm run test:electron` |
| AWS Lambda                   | `@loutrejs/runtime-lambda`   | `npm run test:lambda`   |

## Package構成

| Package                  | 役割                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `@loutrejs/core`         | Contract、Module、Provider、Implementation、typed token、Context Key、Layer descriptor |
| `@loutrejs/graph`        | Application Graph IR、Graph Builder、Graph Probe、semantic validation  |
| `@loutrejs/runtime`      | DI container、Execution Context、Pipeline engine                       |
| `@loutrejs/http`         | HTTP Contract、validation、authentication、Request / Response adapter  |
| `@loutrejs/message-port` | MessagePort protocol、server-stream finalization                       |
| `@loutrejs/runtime-*`    | 各JavaScript runtimeとの境界adapter                                    |
| `@loutrejs/cli`          | `check`、`doctor`、`graph`、`explain`、`build`、`dev`、`start`         |

## 設計ドキュメント

Application Graph、DI、Pipeline、Protocolなどの詳しい設計は
[`docs/architecture.md`](./docs/architecture.md)を参照してください。実装上の補足は
[`docs/adr/phase-1-decisions.md`](./docs/adr/phase-1-decisions.md)にまとめています。

## 開発

Node.js 26.xで依存関係をインストールし、基本検証を実行します。

```sh
npm install
npm run check
npm run test:types
npm test
npm run build
```

すべてのランタイムに対するconformance testを含める場合は、必要なruntimeを用意して
次を実行します。

```sh
npm run verify
```

個別の検証コマンドは[`package.json`](./package.json)を参照してください。

## コントリビューション

IssueやPull Requestを歓迎します。大きな変更やPublic APIに関わる提案は、実装前に
[Issue](https://github.com/come25136/loutrejs/issues)で目的と設計方針を共有してください。

Pull Requestでは、変更に対応するtestを追加し、可能な範囲で`npm run verify`を通して
ください。設計やPublic APIへ影響する変更は、先にIssueで方向性を相談してください。

## ライセンス

Loutreは[MIT License](./LICENSE)のもとで公開されています。
