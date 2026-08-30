# Getting Started

このドキュメントでは、Loutre Applicationの作成と主要な利用方法をまとめます。

## Create a project

`create-loutre`はTargetとpackage managerを対話形式で選択できます。

```sh
# npm / Node.js
npm create loutre@latest my-app

# Bun
bun create loutre my-app

# Deno
deno x -A npm:create-loutre@latest my-app
```

対応Target:

- Node.js
- Bun
- Deno
- Cloudflare Workers
- AWS Lambda

対応package manager:

- npm
- pnpm
- Yarn
- Bun
- Deno

非対話ではoptionで指定できます。

```sh
npm create loutre@latest my-app -- --target cloudflare-workers --package-manager pnpm
```

依存関係のinstallを後回しにする場合は`--no-install`を指定します。`--yes`ではTargetにNode.js、package managerにinitializerを起動したpackage managerを使用します。

生成されるstarterにはVitest、Oxlint、Oxfmtとサンプルtestが含まれます。`verify` scriptでformat、lint、型 / Application Graph、test、target固有buildをまとめて確認できます。

## HTTP Application

Application DefinitionはHTTP serverそのものではありません。Contract / Implementation / ModuleとしてApplicationを定義し、実行環境はHost側で接続します。

```ts
import {
  contract,
  defineApplication,
  defineModule,
  implementation,
  inject,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const GreetingContract = contract([
  http({
    greet: {
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
    },
  }),
])

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
      return ctx.response.ok({ body: greetings.greet(ctx.params.name) })
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

同じprotocolのprocedureは1つのgroupへまとめられます。複数protocolを同じContractへ載せる場合は`contract([http({...}), graphqlGroup, websocketGroup, sseGroup])`のようにgroupを配列へ並べます。featureやprotocol単位でファイルを分けたい場合は、それぞれを`contract([...])`にして最後に`contract.merge(contracts)`で統合できます。merge時は同じprocedure名に異なるprotocolを重ねられますが、同じ`procedure + protocol`の二重定義は拒否されます。Contract自体は名前を持ちません。

Node.jsでは`@loutrejs/node`からApplicationをserveできます。

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

await nodeRuntime.serve({ application, port: 3000 })
```

HTTP listenerを持たずにApplicationを組み込みたい場合は、`bootstrap()`からWeb Standardの`fetch(request)`を利用できます。

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import application from './app.js'

const app = bootstrap({ application })
const response = await app.fetch(
  new Request('http://localhost/greetings/Loutre'),
)
await app.close()
```

## Typed HTTP Client

HTTP Contractはserverだけでなくclientのsource of truthとして利用できます。Implementationやhandlerの型をclientへ公開する必要はありません。

```ts
import { createHttpClient, fetchHttpTransport } from '@loutrejs/loutre/http'
import { GreetingContract } from './app.js'

const client = createHttpClient(
  GreetingContract,
  fetchHttpTransport({ baseUrl: 'https://example.com' }),
)

const response = await client.greet({
  params: { name: 'Loutre' },
})

if (response.status === 200) {
  console.log(response.body.message)
}
```

request型はStandard Schemaのinput、response型はStandard Schemaのoutputから導出されます。responseはContractに宣言されたstatusとschemaでruntime validationされます。

独自transportを使う場合は`HttpClientTransport`を実装して`createHttpClient()`へ渡します。これによりtest、IPC、custom fetch policyなどでも同じContract-derived client surfaceを利用できます。

## Module visibility

Moduleの`exports`はApplication Graph上の正式なdependency boundaryです。別ModuleのProviderへ依存する場合、依存元は宣言元Moduleを`imports`し、宣言元はProviderを`exports`します。

```ts
class UsersService {}

const UsersModule = defineModule(() => ({
  providers: [UsersService],
  exports: [UsersService],
}))

class BillingService {
  constructor(readonly users = inject(UsersService)) {}
}

const BillingModule = defineModule(() => ({
  imports: [UsersModule()],
  providers: [BillingService],
}))
```

importされていてもexportされていないProviderへのcross-module dependencyはGraph compile時に`LUTRE_MODULE_VISIBILITY`で拒否されます。同一Module内のdependencyに`exports`は不要です。

## Task / Arguments

Hostから受け取るstructured inputは`Arguments`、明示的に実行する処理はpublic `Task`として宣言できます。

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

HostからArgumentsを渡してTaskを実行します。

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

## Runtime Support

次のruntimeを継続的に動作確認しています。

| Runtime            | Tested versions |
| ------------------ | --------------- |
| Node.js            | 22 / 24 / 26    |
| Deno               | 2.9             |
| Bun                | 1.3 / 1.4       |
| Cloudflare Workers | workerd         |
| Electron           | 42 / 43 / 44    |
| AWS Lambda         | Node.js 22 / 24 |

Runtimeごとの主な接続API:

```text
Node.js             nodeRuntime.serve()
Bun                 bunRuntime.serve()
Deno                denoRuntime.bind() / serve()
Cloudflare Workers  cloudflareWorkersRuntime.bind()
AWS Lambda          awsLambdaRuntime.bind()
Electron            electronRuntime.attach()
```

## Developer Tooling

`@loutrejs/cli`はApplication Graphとdeployment artifactを扱うdeveloper toolingです。

```sh
npm install --save-dev @loutrejs/cli
```

主なコマンド:

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts
npm exec loutre -- graph contracts --entry src/app.ts --format mermaid
npm exec loutre -- explain GreetingService --entry src/app.ts
npm exec loutre -- doctor --runtime node --entry src/app.ts
npm exec loutre -- build src/app.ts --out-dir dist/loutre
npm exec loutre -- openapi --entry src/app.ts
```

`build --runtime`は`aws-lambda`、`cloudflare-workers`、`deno`のdeployment entry生成に対応します。

```sh
npm exec loutre -- build src/app.ts --runtime aws-lambda
```

## Examples

用途ごとのexampleは[`examples/`](../examples/)を参照してください。
