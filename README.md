<p align="center">
  <img src="./docs/assets/loutre.png" alt="Loutreのカワウソアイコン" width="180">
</p>

<h1 align="center">Loutre</h1>

<p align="center">
  明示的なApplication Graphから、型安全でポータブルなアプリケーションを構築する<br>
  Compiler-firstのTypeScriptフレームワーク
</p>

<p align="center">
  <a href="#特徴">特徴</a> ・
  <a href="#クイックスタート">クイックスタート</a> ・
  <a href="#対応ランタイム">対応ランタイム</a> ・
  <a href="#コントリビューション">コントリビューション</a>
</p>

> [!WARNING]
> Loutreは現在、初期開発段階です。Phase 1のApplication Graphはend-to-endで動作しますが、
> Public APIは安定版ではなく、予告なく変更される可能性があります。

## Loutreとは

Loutreは、Contract、Module、Provider、Pipeline、Controllerの関係を明示的な
Application Graphとして表現するTypeScriptアプリケーションフレームワークです。
CompilerがGraphを静的に検証し、同じapplication modelをNode.js、Bun、Deno、
Cloudflare Workers、AWS Lambda、Electronなどのランタイムへ接続します。

```text
Contract → Protocol decode → ordered Pipeline → Controller
         → output validation → Protocol serialization
```

Filesystem規約やruntime reflectionに依存せず、依存関係、実行順序、Contextの変化を
コードとCompiler diagnosticsから追えることを目指しています。

## 特徴

- **Compiler-first** — TypeScript ASTからversion付きGraph ManifestとRuntime Linkage
  Artifactを生成し、binding、coverage、pipeline順序などを静的に検証
- **Contract-first** — 入出力schema、response variant、protocolごとのwire modelを
  Contractに集約
- **型付きPipeline** — `requires` / `provides`でLayer間のContext変化を表現し、
  Controllerが受け取る最終Context shapeを導出
- **明示的なDI** — class、typed token、`application` / `transient` scope、
  parameterized Module、conditional Providerに対応
- **Schema相互運用** — Standard Schema互換のvalidatorを利用可能
- **マルチランタイム** — application codeを保ったまま、adapterを介して複数の
  JavaScript runtimeへ展開
- **複数protocol** — HTTPとMessagePortを備え、unaryおよびserver streamingに対応

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

## CLI

CLIはfilesystem discoveryを行いません。buildやserver起動ではentry fileを明示します。

```sh
npx loutre check
npx loutre doctor node
npx loutre graph contracts
npx loutre explain <diagnostic-code>
npx loutre build fixtures/http-crud/src/app.ts --out-dir dist/loutre
npx loutre start fixtures/http-crud/src/app.ts --port 3000
```

通常classのconstructor依存はCompilerが解析し、Runtime Linkage Artifactとして
自動接続します。application codeでdependency mapを手書きする必要はありません。

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
| `@loutrejs/compiler` | AST解析、Graph Manifest、Runtime Linkage Artifact、静的診断 |
| `@loutrejs/runtime` | DI container、Execution Context、Pipeline engine |
| `@loutrejs/http` | HTTP Contract、validation、authentication、Request / Response adapter |
| `@loutrejs/message-port` | MessagePort protocol、server-stream finalization |
| `@loutrejs/runtime-*` | 各JavaScript runtimeとの境界adapter |
| `@loutrejs/cli` | `check`、`doctor`、`graph`、`explain`、`build`、`dev`、`start` |

## アーキテクチャと現在の実装範囲

Phase 1では、次のcanonical fixtureをend-to-endで実行できます。

- [`fixtures/http-crud`](./fixtures/http-crud): HTTP GET / POST、params / body検証、Provider DI
- [`fixtures/http-auth`](./fixtures/http-auth): Authentication / Guard、Context Key
- [`fixtures/database-modules`](./fixtures/database-modules): Module複数instance、Env、Lifecycle
- [`fixtures/streaming`](./fixtures/streaming): 同じdomain streamのHTTP SSE / MessagePort公開

Phase 1の規範的な設計は[`architecture.md`](./architecture.md)をsource of truthとします。
実装時の暫定的な選択は
[`docs/phase-1-decisions.md`](./docs/phase-1-decisions.md)、完成条件と検証の対応は
[`docs/phase-1-completion.md`](./docs/phase-1-completion.md)に記録しています。

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
ください。Phase 1のFROZEN要件と衝突する変更は、先に`architecture.md`上の合意が必要です。

## ライセンス

Loutreは[MIT License](./LICENSE)のもとで公開されています。
