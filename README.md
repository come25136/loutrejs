<p align="center">
  <img src="./docs/assets/loutre.png" alt="Loutreのカワウソアイコン" width="180">
</p>

<h1 align="center">Loutre</h1>

<p align="center">
  <strong>型でつないで、どこでも泳ぐ。</strong><br>
  Contract・DI・PipelineをApplication Graphで束ねる、ポータブルなTypeScript Application Framework。
</p>

<p align="center">
  <a href="https://github.com/come25136/loutrejs/actions/workflows/ci.yml"><img src="https://github.com/come25136/loutrejs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#特徴">特徴</a> ・
  <a href="#quick-start">Quick Start</a> ・
  <a href="#packages">Packages</a> ・
  <a href="#runtime-support">Runtime Support</a> ・
  <a href="#developer-tooling">Developer Tooling</a> ・
  <a href="./docs/architecture.md">Architecture</a>
</p>

> [!WARNING]
> Loutreは現在v0.1開発中です。Public APIには破壊的変更が入る可能性があります。
> 公開packageはまだnpmへpublishしていません。

## Loutreとは

Loutreは、Applicationを**明示的なGraph**として組み立てるTypeScript Application Frameworkです。

Contract、DI、Pipeline、Environment、Arguments、Task、Trigger、LifecycleをひとつのApplication modelとして扱い、Type System、Runtime、Developer Toolingが同じApplication Graphを見ます。

```text
Application Definition
        │
        ▼
 Application Graph
   ┌────┼─────┐
   ▼    ▼     ▼
 Types Runtime Tooling
```

Application sourceはHostから分離されます。同じDefinitionをNode.jsのHTTP server、Bun、Deno、workerd、AWS Lambda、Electronなどへ接続できます。

## 特徴

- **Graph-first** — Module、DI、Protocol、Task、Trigger、Capabilityを検査・説明できるGraphとして持つ
- **Explicit over magic** — decorator、metadata、filesystem discoveryへ依存しない
- **Type-safe DI** — constructor default parameterと`inject()`でdependencyを宣言する
- **Portable Application Definition** — Application codeからruntime固有APIとlistener ownershipを分離する
- **Typed Pipeline** — request / user / tenant / transaction等のexecution dataをContextとして流す
- **Standard Schema** — Environment、Arguments、HTTP validation、Queue payloadに共通schema boundaryを使う
- **Host-owned execution** — argv parsing、HTTP listener、Lambda handler等はHost / Runtime Adapterが所有する
- **Graph tooling** — `check`、`graph`、`explain`、`doctor`、`build`、`openapi`を同じApplication modelから実行する

## Quick Start

### npm create

npm公開後は、initializer package `create-loutre` からNode.js HTTP Applicationを生成できます。

```sh
npm create loutre@latest my-app
cd my-app
npm run dev
```

依存関係のinstallを後回しにする場合は、`--no-install`をinitializerへ渡します。

```sh
npm create loutre@latest my-app -- --no-install
```

`create-loutre`自身もLoutre Applicationとして実装され、project生成をpublic `Task`として実行します。argv parsing、対話prompt、package installはHost側が所有します。

### Repositoryで試す

現在はnpm公開前なので、まずrepositoryをcloneして実行します。Node.jsは`>=22`が必要です。

```sh
git clone https://github.com/come25136/loutrejs.git
cd loutrejs
npm install
npm run build
```

最小のone-shot Applicationは`examples/hello-cli`で試せます。

```sh
npm run start --workspace @loutrejs/example-hello-cli -- --name Loutre
# Hello, Loutre!
```

### HTTP Application

Application DefinitionはHTTP serverを直接起動しません。
Contract / Implementation / Moduleを組み立ててportableなDefinitionをexportします。

```ts
import {
  contract,
  defineApplication,
  defineModule,
  implementation,
  inject,
  procedure,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const GreetingContract = contract({
  greet: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/greetings/{name}',
        request: {
          params: {
            name: z.string().min(1),
          },
        },
        responses: {
          ok: {
            status: 200,
            body: z.object({ message: z.string() }),
          },
        },
        pipeline: [validate.params, http.controller],
      }),
    },
  }),
})

class GreetingService {
  greet(name: string) {
    return { message: `こんにちは、${name}！` }
  }
}

const GreetingController = implementation({
  name: 'GreetingController',
  contract: GreetingContract,
  protocol: http,
  factory: (greetings = inject(GreetingService)) => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: greetings.greet(ctx.params.name),
      })
    },
  }),
})

const GreetingModule = defineModule(() => ({
  providers: [GreetingService],
  implementations: [GreetingController],
}))

export default defineApplication({
  modules: [GreetingModule()],
})
```

Node.jsでself-hostする場合はHost entry側だけで`nodeRuntime`へ接続します。

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const server = await nodeRuntime.serve({
  application,
  port: 3000,
  hostname: '0.0.0.0',
})

process.once('SIGTERM', () => void server.close('SIGTERM'))
```

`bootstrap()`を使う場合もlistenerは所有せず、HTTP-capable ApplicationにはWeb Standardの`fetch(request)`だけを公開します。

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import application from './app.js'

const app = bootstrap({ application })
const response = await app.fetch(
  new Request('http://localhost/greetings/Loutre'),
)
await app.close()
```

### Task / Arguments

ApplicationがHostから受け取るstructured inputは`Arguments`、明示的に実行する処理はpublic `Task`として宣言できます。

```ts
import { defineApplication, defineArgs, inject, task } from '@loutrejs/loutre'
import { z } from 'zod'

class AppArgs extends defineArgs(
  z.object({
    workers: z.number().int().positive(),
  }),
) {}

export const rebuild = task<void, void>({
  name: 'search.rebuild',
  factory:
    (args = inject(AppArgs)) =>
    async () => {
      console.log(`workers=${args.workers}`)
    },
})

export const application = defineApplication({
  modules: [],
  arguments: AppArgs,
  tasks: [rebuild],
})
```

argv parsingはHostが所有します。

```ts
const app = bootstrap({
  application,
  arguments: {
    workers: argv.workers,
  },
})

await app.run(rebuild)
await app.close('complete')
```

Triggerからだけ参照されるTaskは自動execution専用で、public `app.run()`には公開されません。

## Packages

| Package            | 役割                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `@loutrejs/loutre` | Core、Application、Graph、Runtime、HTTP、MessagePort、runtime adapterの本体 |
| `@loutrejs/node`   | Node.js HTTP runtime adapter                                                |
| `@loutrejs/bullmq` | BullMQ Queue Consumer Driver binding                                        |
| `@loutrejs/cli`    | Graph inspection、build、OpenAPI generation                                 |
| `create-loutre`    | `npm create loutre@latest`用のproject initializer                           |

`@loutrejs/loutre`は`/host`、`/binding`、`/graph`、`/runtime`、`/http`、`/message-port`、`/openapi`等のsubpath exportを持ちます。

## Runtime Support

CIでは次のruntimeを継続的にconformance testしています。

| Runtime    | CI baseline                      |
| ---------- | -------------------------------- |
| Node.js    | 22.x / 24.x / 26.x               |
| Deno       | 2.9 LTS                          |
| Bun        | 1.3 / 1.4                        |
| workerd    | lockfile version                 |
| Electron   | 42 / 43 / 44                     |
| AWS Lambda | Node.js 22 / 24相当のconformance |

Runtimeごとの接続APIは用途に合わせて分かれます。

```text
Node.js      nodeRuntime.serve()
Bun          bunRuntime.serve()
Deno         denoRuntime.bind() / serve()
workerd      workerdRuntime.bind()
AWS Lambda   lambdaRuntime.bind()
Electron     electronRuntime.attach()
```

## Developer Tooling

Loutre CLIはApplicationの起動コマンドではなく、Application Graphとdeployment artifactを扱うdeveloper toolingです。

repository内では次のように実行できます。

```sh
node packages/cli/bin/loutre.js check --entry fixtures/http-crud/src/app.ts
node packages/cli/bin/loutre.js graph di --entry fixtures/http-crud/src/app.ts
node packages/cli/bin/loutre.js graph contracts --entry fixtures/http-crud/src/app.ts --format mermaid
node packages/cli/bin/loutre.js explain GreetingService --entry examples/hello-http/src/app.ts
node packages/cli/bin/loutre.js doctor node --entry fixtures/http-crud/src/app.ts
node packages/cli/bin/loutre.js build fixtures/http-crud/src/app.ts --out-dir dist/loutre
node packages/cli/bin/loutre.js openapi --entry fixtures/http-crud/src/app.ts
```

`build --runtime`は現時点で`lambda`、`workerd`、`deno`のdeployment entry生成に対応します。

```sh
node packages/cli/bin/loutre.js build fixtures/http-crud/src/app.ts --runtime lambda
```

`loutre run` / `loutre dev` / `loutre start`は提供しません。
Applicationの実行方法はHostが所有します。

## Examples

`examples/`にはHTTP、Auth、CORS、Task / Worker、Database integrationの利用例があります。

- [`examples/hello-http`](./examples/hello-http/) — Contract / Pipeline / HTTP Implementation
- [`examples/hello-cli`](./examples/hello-cli/) — Arguments / public Task / Host-owned argv parsing
- [`examples/hello-worker`](./examples/hello-worker/) — fixed-delay Trigger
- [`examples/basic-auth`](./examples/basic-auth/) — Basic Auth Layer
- [`examples/bearer-auth`](./examples/bearer-auth/) — custom authentication Layer
- [`examples/cors`](./examples/cors/) — CORS Layer
- [`examples/database-postgres`](./examples/database-postgres/) — Provider / LifecycleによるPostgreSQL integration
- [`examples/database-drizzle-postgres`](./examples/database-drizzle-postgres/) — Drizzle integration
- [`examples/database-prisma-postgres`](./examples/database-prisma-postgres/) — Prisma integration
- [`examples/database-transactions`](./examples/database-transactions/) — Layer / Contextによるtransaction boundary

## Architecture

Loutre v0.1のarchitecture source of truthは[`docs/architecture.md`](./docs/architecture.md)です。
実装・public type tests・runtime conformanceとの差異は放置せず、architectureと実装が一致するように解消します。

## Development

```sh
npm install
npm run verify
```

個別checkも実行できます。

```sh
npm run format:check
npm run lint
npm run check
npm run test:types
npm test
npm run build
npm run test:conformance
```

CIはNode.js 22 / 24 / 26のunit・E2E testと、Deno / Bun / workerd / Electron / AWS Lambdaのruntime conformanceを並列実行します。

## License

[MIT](./LICENSE)
