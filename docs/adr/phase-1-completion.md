# Phase 1完成条件の検証対応表

この文書は`architecture.md`を変更するものではありません。Section 36の完成条件を、
実装と自動検証へ対応付けるための非規範的な監査表です。

| 条件                                                                                                                   | 実装・検証証拠                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 4つのcanonical integration                                                                                             | `integrations/http-crud`、`integrations/http-auth`、`integrations/database-modules`、`integrations/streaming`と各integration test |
| invalid variationの静的診断                                                                                            | `graph-validation.test.ts`、`http-auth.integration.test.ts`、type-level tests                                                     |
| 複数runtimeの同一integration conformance                                                                               | `runtime-conformance.integration.test.ts`と`conformance/`内の実runtime runner                                                     |
| HTTP unary + server-stream                                                                                             | Node実socket integration、SSE item validation、streaming body integration test                                                    |
| Custom TokenとModule複数instance                                                                                       | `di.test.ts`、`database-modules.integration.test.ts`                                                                              |
| Pipeline / validation / Context Key / short circuit / terminal / Pipeline由来Context shape / Controller application DI | type-level tests、`pipeline.test.ts`、Compiler tests、integration tests                                                           |
| CLI Graph                                                                                                              | `cli.integration.test.ts`と`loutre graph modules/di/contracts/runtime`                                                            |
| Env secretをGraphへ含めない                                                                                            | symbolic `EnvKey` testとManifest構造                                                                                              |
| Lifecycle / Capabilityの可視化                                                                                         | runtime integration tests、Capability test、Manifest、`loutre doctor`                                                             |
| Structured contextual Logger                                                                                           | `structured-logging.test.ts`、カラーconsole / JSON adapter、HTTP / MessagePort完了event、error ID相関、共通backend注入            |
| Rejected設計を復活させない                                                                                             | filesystem discovery、`@Injectable`、route decorator、`next()`を不使用                                                            |
| Node.js 26.x                                                                                                           | `test:node`がmajor versionを検証してHTTP integrationを実行                                                                        |
| Deno/Bun/workerd/Electron/Lambda                                                                                       | 2.9.5 / 1.4.0 / 2026-08-24 / 43.4.1 / Node 24.19.0で実行                                                                          |
| constructor DIの自動link                                                                                               | Compiler生成のRuntime Linkage Artifactで`integrations/`と`examples/`を起動し、Public APIに手書きdependency mapを持たない          |
| Artifact整合性                                                                                                         | Graph ManifestとRuntime Linkage Artifactのversion/fingerprintを起動前に検証                                                       |

## 一括検証

```sh
npm run verify
```

このcommandはTypeScript check、type-level test、unit / integration / E2E test、build、全runtime
conformanceを順に実行します。

> [!NOTE]
> 本文書はPhase 1完了時点の履歴である。Source Compiler / Runtime Linkageに関する項目は
> `loutre_source_compiler_removal_architecture_amendment.md`と現行`architecture.md`で上書きされた。
