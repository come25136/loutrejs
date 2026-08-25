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
{"message":"こんにちは、Loutre！"}
```

最小構成のapplicationは
[`examples/hello-http/src/app.ts`](./examples/hello-http/src/app.ts)で確認できます。

### サンプル

| サンプル | 内容 | 起動コマンド |
| --- | --- | --- |
| [Hello HTTP](./examples/hello-http) | path parameter検証、型付きController、Provider DI | `npm run dev --workspace @loutrejs/example-hello-http` |
| [Basic認証](./examples/basic-auth) | `basicAuth()`、authentication Layer、HTTP 401 | `npm run dev --workspace @loutrejs/example-basic-auth` |
| [Bearer認証](./examples/bearer-auth) | ユーザー定義認証Layer、Context Key | `npm run dev --workspace @loutrejs/example-bearer-auth` |
| [Database Transactions](./examples/database-transactions) | DB不要のtransaction / savepoint / ambient client | `npm run dev --workspace @loutrejs/example-database-transactions` |
| [PostgreSQL Database](./examples/database-postgres) | `pg`のPool / PoolClient adapter | `npm run dev --workspace @loutrejs/example-database-postgres` |
| [Drizzle PostgreSQL](./examples/database-drizzle-postgres) | native begin optionsとnested transaction | `npm run dev --workspace @loutrejs/example-database-drizzle-postgres` |
| [Prisma PostgreSQL](./examples/database-prisma-postgres) | Prisma 7 interactive / nested transaction | `npm run dev --workspace @loutrejs/example-database-prisma-postgres` |

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
  constructor(
    readonly repository = inject(UserRepository),
  ) {}
}
```

`inject()`はframework-managed class construction中だけ利用でき、Runtime解決と
Graph Probeによるdependency edge収集のsource of truthになります。DI constructionは同期で、
非同期resourceの初期化と終了はLifecycle hookへ分離します。

## Database integration

`@loutrejs/database`はORMやdriverを抽象化せず、Database resourceのLifecycle、ambient
transaction propagation、transaction Composite Layerを提供します。adapter固有optionは
`options.begin` / `options.savepoint`の型をそのまま保持します。

```ts
import { transaction } from '@loutrejs/database'

const createUser = transaction({
  database: PrismaDatabase,
  options: {
    begin: {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  },
  pipeline: [
    authorization,
    validate.body,
    http.controller,
  ],
})

void createUser
```

Graph ProbeはDatabaseServiceを同期生成しますが、`connect()`、transaction scope、child Pipelineを
実行しません。詳細は
[`docs/database_architecture.md`](./docs/database_architecture.md)を参照してください。

DBを用意せずに試す場合は
[`examples/database-transactions`](./examples/database-transactions)を実行してください。実際の
adapter実装は[`pg`](./examples/database-postgres)、
[`Drizzle`](./examples/database-drizzle-postgres)、
[`Prisma`](./examples/database-prisma-postgres)で比較できます。

## 対応ランタイム

| ランタイム | Adapter | Conformance test |
| --- | --- | --- |
| Node.js 26.x | `@loutrejs/runtime-node` | `npm run test:node` |
| Deno | `@loutrejs/runtime-deno` | `npm run test:deno` |
| Bun | `@loutrejs/runtime-bun` | `npm run test:bun` |
| Cloudflare Workers / workerd | `@loutrejs/runtime-workerd` | `npm run test:workerd` |
| Electron | `@loutrejs/runtime-electron` | `npm run test:electron` |
| AWS Lambda | `@loutrejs/runtime-lambda` | `npm run test:lambda` |

## Package構成

| Package | 役割 |
| --- | --- |
| `@loutrejs/core` | Contract、Module、Provider、typed token、Context Key、Layer descriptor |
| `@loutrejs/database` | DatabaseService、ambient transaction propagation、transaction Layer |
| `@loutrejs/graph` | Application Graph IR、Graph Builder、Graph Probe、semantic validation |
| `@loutrejs/runtime` | DI container、Execution Context、Pipeline engine |
| `@loutrejs/http` | HTTP Contract、validation、authentication、Request / Response adapter |
| `@loutrejs/message-port` | MessagePort protocol、server-stream finalization |
| `@loutrejs/runtime-*` | 各JavaScript runtimeとの境界adapter |
| `@loutrejs/cli` | `check`、`doctor`、`graph`、`explain`、`build`、`dev`、`start` |

## 設計ドキュメント

Application Graph、DI、Pipeline、Protocolなどの詳しい設計は
[`architecture.md`](./architecture.md)を参照してください。実装上の補足は
[`docs/phase-1-decisions.md`](./docs/phase-1-decisions.md)にまとめています。

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
