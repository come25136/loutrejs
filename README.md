<p align="center">
  <img src="./docs/assets/loutre.svg" alt="Loutreのカワウソアイコン" width="180">
</p>

<h1 align="center">Loutre</h1>

<p align="center">
  <strong>型でつないで、どこでも泳ぐ。</strong><br>
  ポータブルなTypeScript Application Framework。
</p>

<p align="center">
  <a href="https://github.com/come25136/loutrejs/actions/workflows/ci.yml"><img src="https://github.com/come25136/loutrejs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@loutrejs/loutre"><img src="https://img.shields.io/npm/v/%40loutrejs%2Floutre.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

Loutreは、Contract、DI、Pipeline、Task、TriggerなどをひとつのApplicationとして組み立てるTypeScript Frameworkです。
Applicationをruntime固有APIから分離し、Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronなどへ同じ設計を持ち運べます。

> [!WARNING]
> Loutreは現在v0.xです。Public APIには破壊的変更が入る可能性があります。

## Why Loutre

Applicationが大きくなるほど、HTTP、background task、queue、configuration、DI、deploymentの境界は複雑になります。Loutreはそれらを個別の仕組みとして増やすのではなく、ひとつのApplication DefinitionとApplication Graphから扱います。

構成を明示的なTypeScript codeとして保つことで、RuntimeとDeveloper Toolingが同じApplication modelを共有できます。Frameworkのmagicより、型と構造から追える設計を優先しています。

## Quick Start

```sh
npm create loutre@latest my-app
cd my-app
npm run dev
```

BunやDenoからもprojectを作成できます。

```sh
bun create loutre my-app
deno x -A npm:create-loutre@latest my-app
```

Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda向けのstarterを選択できます。

## Application

LoutreではHTTPだけでなく、TaskやTriggerもApplicationの一部として宣言できます。

```ts
import { defineApplication, task } from '@loutrejs/loutre'

export const hello = task<void, string>({
  name: 'hello',
  factory: () => () => 'Hello, Loutre!',
})

export default defineApplication({
  modules: [],
  tasks: [hello],
})
```

HTTP Application、DI、Pipeline、Environment、Argumentsなどを含む例は[Getting Started](./docs/getting-started.md)を参照してください。

## Features

- **Portable Application** — Application codeをruntime固有APIから分離
- **Type-safe composition** — Contract、DI、Pipeline、Environment、ArgumentsをTypeScriptで接続
- **Explicit architecture** — decoratorやfilesystem discoveryに依存せず、構成をcodeから追跡可能
- **Unified execution model** — HTTP、Task、Trigger、Queueを同じApplication modelで表現
- **Multi-runtime** — Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronをサポート
- **Application Graph** — Module、dependency、Contract、execution、runtime requirementを検査可能
- **Developer Tooling** — validation、Graph visualization、OpenAPI、deployment artifact生成を提供

## Packages

| Package                                                              | Role                                    |
| -------------------------------------------------------------------- | --------------------------------------- |
| [`@loutrejs/loutre`](https://www.npmjs.com/package/@loutrejs/loutre) | Core Application API / Runtime bindings |
| [`@loutrejs/node`](https://www.npmjs.com/package/@loutrejs/node)     | Node.js HTTP Runtime Adapter            |
| [`@loutrejs/bullmq`](https://www.npmjs.com/package/@loutrejs/bullmq) | BullMQ Queue binding                    |
| [`@loutrejs/cli`](https://www.npmjs.com/package/@loutrejs/cli)       | Graph / build / OpenAPI tooling         |
| [`create-loutre`](https://www.npmjs.com/package/create-loutre)       | Project initializer                     |

## Documentation

- [Getting Started](./docs/getting-started.md) — project作成、HTTP、Task、Runtime、CLI
- [Architecture](./docs/architecture.md) — 設計原則とpublic boundary
- [Examples](./examples/) — HTTP、Auth、CORS、Worker、Database

## Development

```sh
npm install
npm run verify
```

テストは責務ごとに3層へ分けています。

- `npm run test:unit` — frameworkの部品単体を検証
- `npm run test:integration` — `integrations/` のApplication / Moduleを使って境界を検証
- `npm run test:e2e` — `examples/` の実コマンドを起動し、外部境界からproject全体を検証

`integrations/` はテスト専用資産、`examples/` は利用者向けの実行可能projectです。

## License

[MIT](./LICENSE)
