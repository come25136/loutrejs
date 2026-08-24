# Phase 1完成条件の検証対応表

この文書は`architecture.md`を変更するものではありません。Section 36の完成条件を、
実装と自動検証へ対応付けるための非規範的な監査表です。

| 条件 | 実装・検証証拠 |
|---|---|
| 4つのcanonical fixture | `http-crud`、`http-auth`、`database-modules`、`streaming`と各fixture test |
| invalid variationの静的診断 | `compiler.test.ts`、`http-auth.fixture.test.ts`、type-level tests |
| 複数runtimeの同一fixture conformance | `runtime-conformance.test.ts`と`conformance/`内の実runtime runner |
| HTTP unary + server-stream | Node実socket E2E、SSE item validation、streaming body test |
| Custom TokenとModule複数instance | `di.test.ts`、`database-modules.fixture.test.ts` |
| Pipeline / validation / Context Key / short circuit / terminal / Pipeline由来Context shape / Controller application DI | type-level tests、`pipeline.test.ts`、Compiler tests、Fixture B |
| CLI Graph | `cli.test.ts`と`loutre graph modules/di/contracts/runtime` |
| Env secretをGraphへ含めない | symbolic `EnvKey` testとManifest構造 |
| Lifecycle / Capabilityの可視化 | Fixture C、Capability test、Manifest、`loutre doctor` |
| Structured contextual Logger | `structured-logging.test.ts`、カラーconsole / JSON adapter、HTTP / MessagePort完了event、error ID相関、共通backend注入 |
| Rejected設計を復活させない | filesystem discovery、`@Injectable`、route decorator、`next()`を不使用 |
| Node.js 26.x | `test:node`がmajor versionを検証してHTTP fixtureを実行 |
| Deno/Bun/workerd/Electron/Lambda | 2.9.5 / 1.4.0 / 2026-08-24 / 43.4.1 / Node 24.19.0で実行 |
| constructor DIの自動link | Compiler生成のRuntime Linkage Artifactでfixtureとexampleを起動し、Public APIに手書きdependency mapを持たない |
| Artifact整合性 | Graph ManifestとRuntime Linkage Artifactのversion/fingerprintを起動前に検証 |

## 一括検証

```sh
npm run verify
```

このcommandはTypeScript check、type-level test、全unit/E2E test、build、全runtime
conformance、CLI server起動を順に実行します。
> [!NOTE]
> 本文書はPhase 1完了時点の履歴である。Source Compiler / Runtime Linkageに関する項目は
> `loutre_source_compiler_removal_architecture_amendment.md`と現行`architecture.md`で上書きされた。
