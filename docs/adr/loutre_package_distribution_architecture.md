# Loutre Package Distribution Architecture

- Status: **Frozen / Accepted**
- Date: 2026-08-28
- Scope: npm package boundary / public import path

## Decision

Loutreのソースコード上のアーキテクチャ境界を、そのままnpm package境界にはしない。
ユーザーが独立してinstall・依存・version管理する合理的な理由がある場合だけpackageを分離する。

最終的な公開packageは次の4つとする。

| package            | role                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `@loutrejs/loutre` | Framework本体。Application / Core / Graph / Runtime abstraction / Protocol / portable runtime adapterを含む |
| `@loutrejs/node`   | Node.js固有Host adapter                                                                                     |
| `@loutrejs/bullmq` | BullMQ integration                                                                                          |
| `@loutrejs/cli`    | Developer CLI / build tooling                                                                               |

## Main package subpaths

`@loutrejs/loutre`は内部モジュール境界をsubpath exportで表現する。

| subpath                                       | role                                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| `@loutrejs/loutre`                            | Contract / DI / Module / Application definitionなど通常利用API |
| `@loutrejs/loutre/http`                       | HTTP protocol                                                  |
| `@loutrejs/loutre/message-port`               | MessagePort protocol                                           |
| `@loutrejs/loutre/graph`                      | Application Graph tooling                                      |
| `@loutrejs/loutre/runtime`                    | Runtime abstraction                                            |
| `@loutrejs/loutre/host`                       | Runtime-neutral host primitive                                 |
| `@loutrejs/loutre/binding`                    | Invocation / Host binding                                      |
| `@loutrejs/loutre/openapi`                    | OpenAPI generation                                             |
| `@loutrejs/loutre/runtime/bun`                | Bun adapter                                                    |
| `@loutrejs/loutre/runtime/deno`               | Deno adapter                                                   |
| `@loutrejs/loutre/runtime/cloudflare-workers` | workerd / Workers adapter                                      |
| `@loutrejs/loutre/runtime/aws-lambda`         | AWS Lambda adapter                                             |
| `@loutrejs/loutre/runtime/electron`           | Electron adapter                                               |

Node adapterはNode.jsのengine/runtime固有制約を持ち、Node Hostとして独立してinstallする理由があるため`@loutrejs/node`に残す。
BullMQは外部peer dependencyを持つintegrationなので`@loutrejs/bullmq`に分離する。
CLIはbin・bundler・tsxなどDeveloper Tooling固有依存を持つため`@loutrejs/cli`に分離する。

Bun / Deno / Cloudflare Workers / AWS Lambda / Electron adapterは追加のnpm dependencyを要求しないportable adapterなので本体subpathへ統合する。Runtime固有のsupport matrixはconformance testとdocumentationで保証し、package境界のためだけに分割しない。

## Migration

| before                               | after                                         |
| ------------------------------------ | --------------------------------------------- |
| `@loutrejs/core`                     | `@loutrejs/loutre`                            |
| `@loutrejs/application`              | `@loutrejs/loutre`                            |
| `@loutrejs/application/host`         | `@loutrejs/loutre/host`                       |
| `@loutrejs/application/binding`      | `@loutrejs/loutre/binding`                    |
| `@loutrejs/application/openapi`      | `@loutrejs/loutre/openapi`                    |
| `@loutrejs/graph`                    | `@loutrejs/loutre/graph`                      |
| `@loutrejs/runtime`                  | `@loutrejs/loutre/runtime`                    |
| `@loutrejs/http`                     | `@loutrejs/loutre/http`                       |
| `@loutrejs/message-port`             | `@loutrejs/loutre/message-port`               |
| `@loutrejs/message-port/environment` | `@loutrejs/loutre/message-port/environment`   |
| `@loutrejs/runtime-bun`              | `@loutrejs/loutre/runtime/bun`                |
| `@loutrejs/runtime-deno`             | `@loutrejs/loutre/runtime/deno`               |
| `@loutrejs/runtime-workerd`          | `@loutrejs/loutre/runtime/cloudflare-workers` |
| `@loutrejs/runtime-lambda`           | `@loutrejs/loutre/runtime/aws-lambda`         |
| `@loutrejs/runtime-electron`         | `@loutrejs/loutre/runtime/electron`           |
| `@loutrejs/runtime-node`             | `@loutrejs/node`                              |
| `@loutrejs/queue-bullmq`             | `@loutrejs/bullmq`                            |
| `@loutrejs/cli`                      | `@loutrejs/cli`                               |

## Compatibility policy

まだnpm未公開のv0.1段階なので、旧packageを互換shimとして残さない。
repository内のsource / examples / tests / conformance / docsは同時に新しいimport pathへ移行する。

## Consequences

- Quick StartでLoutre内部architectureをpackage名として覚える必要がなくなる。
- Source module boundaryは維持されるため、Graph-firstの内部設計は失わない。
- npm release対象・version同期対象が14 packageから4 packageへ減る。
- portable runtime adapterの追加は原則`@loutrejs/loutre/runtime/*`で行う。
- 外部dependencyや独立install lifecycleを持つintegrationは将来も`@loutrejs/*` packageとして追加できる。
