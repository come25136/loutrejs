<p align="center">
  <img src="./docs/assets/loutre.png" alt="Loutreのカワウソアイコン" width="180">
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

Loutreは、Contract、DI、Pipeline、TaskなどをひとつのApplicationとして組み立てるTypeScript Frameworkです。
Applicationをruntimeから分離し、Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronなどへ同じ設計を持ち運べます。

> [!WARNING]
> Loutreは現在v0.1です。Public APIには破壊的変更が入る可能性があります。

## Quick Start

```sh
npm create loutre@latest my-app
cd my-app
npm run dev
```

BunやDenoからも作成できます。

```sh
bun create loutre my-app
deno x -A npm:create-loutre@latest my-app
```

## Features

- **Portable** — Application codeをruntime固有APIから分離
- **Type-safe** — Contract、DI、Pipeline、Environment、ArgumentsをTypeScriptで接続
- **Explicit** — decoratorやfilesystem discoveryに依存しない構成
- **Multi-runtime** — Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronをサポート
- **Tooling** — ApplicationからGraph inspection、OpenAPI、deployment artifactを生成

## Packages

- [`@loutrejs/loutre`](https://www.npmjs.com/package/@loutrejs/loutre) — Core
- [`@loutrejs/node`](https://www.npmjs.com/package/@loutrejs/node) — Node.js runtime
- [`@loutrejs/bullmq`](https://www.npmjs.com/package/@loutrejs/bullmq) — BullMQ integration
- [`@loutrejs/cli`](https://www.npmjs.com/package/@loutrejs/cli) — Developer tooling
- [`create-loutre`](https://www.npmjs.com/package/create-loutre) — Project initializer

## Documentation

- [Getting Started](./docs/getting-started.md) — Application作成、HTTP、Task、Runtime、CLI
- [Architecture](./docs/architecture.md) — 設計原則とpublic boundary
- [Examples](./examples/) — HTTP、Auth、CORS、Worker、Database integration

## Development

```sh
npm install
npm run verify
```

## License

[MIT](./LICENSE)
