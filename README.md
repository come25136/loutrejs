# Loutre

Loutreは、明示的なApplication Graphを中心とするCompiler-firstのTypeScript
application frameworkです。Phase 1の規範的な設計は
[architecture.md](./architecture.md)だけをsource of truthとします。このREADMEは、
実装状況と開発方法を説明するための非規範的なガイドです。

## 実装済みのPhase 1

4つのcanonical fixtureを含むPhase 1のApplication Graphをend-to-endで実行できます。

```text
Contract -> HTTP decode -> ordered Pipeline -> validate.*
         -> ctx.session等のContext property -> application-scoped Controller -> logical response
         -> output validation -> HTTP serialization
```

主なpackageは次のとおりです。

- `@loutrejs/core`: Standard Schema型、DI用typed token、Context Key、`@Inject`、
  Provider、parameterized Module、Contract/Procedure宣言、requires/provides型付きLayer descriptor
- `@loutrejs/compiler`: TypeScript AST解析、version付きGraph Manifest、Runtime Linkage Artifact、および
  terminal、coverage、duplicate binding、validation順序、Context Key、Controller DIの診断
- `@loutrejs/runtime`: `application` / `transient` scopeのDI、Execution Context伝播、
  inbound・FILO outboundのPipeline engine
- `@loutrejs/http`: HTTP Contract descriptor、4種類の`validate.*` Layer、`basicAuth()`、
  Pipelineから最終Context shapeを導出するController型、portableなRequest/Response
  application adapter、Protocol Finalization
- `@loutrejs/runtime-node`: Node.js 26向けHTTP server boundary
- `@loutrejs/message-port`: MessagePort protocol、server-stream finalization
- `@loutrejs/runtime-{deno,bun,workerd,electron,lambda}`: 各runtime adapter
- `@loutrejs/cli`: `check`、`doctor`、`graph`、`explain`、`build`、`dev`、`start`

Canonical fixture:

- `fixtures/http-crud`: HTTP GET/POST、params/body validation、通常Provider DI
- `fixtures/http-auth`: Authentication / Guard、developer-defined Context Key、typed Context取得
- `fixtures/database-modules`: Module 2 instance、Env、conditional Provider、Lifecycle
- `fixtures/streaming`: 同じdomain streamのHTTP SSE / MessagePort公開

利用者向けのサンプルアプリは`examples/`にあります。

- `examples/hello-http`: HTTP API、入力検証、Controller、Provider DIの最小例
- `examples/basic-auth`: Basic認証、authentication Layer、Context Key、HTTP 401の例

```sh
npm run dev --workspace @loutrejs/example-hello-http
```

別のターミナルからリクエストします。

```sh
curl http://127.0.0.1:3000/greetings/Loutre
```

Fixture Aの実行に必要だったOPEN項目の最小選択は、
[docs/phase-1-decisions.md](./docs/phase-1-decisions.md)に記録しています。
これらはFROZEN APIではありません。

## 開発方法

Node.js 26.xが必要です。

```sh
npm install
npm run check
npm run test:types
npm test
npm run build
npm run test:conformance
```

個別runtimeのconformanceは`test:node`、`test:deno`、`test:bun`、
`test:workerd`、`test:electron`、`test:lambda`で実行できます。全検証は
`npm run verify`で実行します。

CLIはfilesystem discoveryを行いません。Server起動時は明示entryを指定します。

```sh
npx loutre check
npx loutre doctor node
npx loutre graph contracts
npx loutre build fixtures/http-crud/src/app.ts --out-dir dist/loutre
npx loutre start fixtures/http-crud/src/app.ts --port 3000
```

通常classのconstructor依存はCompilerが解析し、Runtime Linkage Artifactとして
自動接続します。Application codeでdependency mapを手書きする必要はありません。

Architecture完成条件と証拠の対応は
[docs/phase-1-completion.md](./docs/phase-1-completion.md)に記録しています。
