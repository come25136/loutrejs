# Loutreをはじめる

このガイドでは、Loutre Applicationを作成し、型付きHTTP APIをテストして、Runtimeへ接続するところまで進めます。

例の責務は分けています。Applicationコードは処理をどう構成するか、テストは外から見て何を保証するかを示します。コミットには変更が必要な理由を残し、コードコメントは自然に見える別の選択肢を採用しなかった理由がある場合だけ使います。

## プロジェクトを作成する

`create-loutre`を起動すると、Targetとパッケージマネージャーを対話形式で選択できます。最初はNode.jsとnpmを選ぶと、このガイドのコマンドをそのまま実行できます。

```sh
npm create loutre@latest my-app
bun create loutre my-app
deno x -A npm:create-loutre@latest my-app
```

作成先へ移動します。

```sh
cd my-app
```

生成されるprojectは、Loutreが推奨するfeature単位の構造になっています。

```text
src/
├ app.ts          root ModuleのwiringとApplication Definition
├ app.test.ts     Application boundaryの振る舞いを検証
├ hello/
│  ├ contract.ts  hello featureのHTTP Contract
│  └ controller.ts
└ main.ts         Applicationと選択したRuntimeの接続
```

Applicationが大きくなったら、ControllerやProviderをtype別のglobal directoryへ集めるのではなく、`users/`、`auth/`、`database/`のようなfeatureまたはintegration directoryを追加します。authenticationやtransactionのようなcross-cuttingなPipeline behaviorは`layers/`へ置けます。詳しいruleは[Architecture](./architecture.md#project-structure)を参照してください。

Targetとパッケージマネージャーを先に決めている場合は、非対話で作成できます。

```sh
npm create loutre@latest my-app -- --target cloudflare-workers --package-manager pnpm
```

利用できるTargetはNode.js、Bun、Deno、Cloudflare Workers、AWS Lambdaです。パッケージマネージャーはnpm、pnpm、Yarn、Bun、Denoに対応しています。

依存関係を後からインストールする場合は`--no-install`、質問を省略して既定値を使う場合は`--yes`を指定します。`--yes`ではTargetにNode.js、パッケージマネージャーにinitializerを起動したものを使います。

## HTTP Applicationを定義する

名前を受け取って挨拶を返す`greetings` featureを追加します。HTTP Contract、Provider、Implementationはfeature directoryの中に置き、`app.ts`はそれらをApplicationへ組み込むwiringに集中させます。

`src/greetings/contract.ts`で外部向けのHTTP boundaryを定義します。

```ts
import { contract } from '@loutrejs/loutre'
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
```

`src/greetings/service.ts`にはfeatureが使うapplication logicを置きます。

```ts
export class GreetingService {
  greet(name: string) {
    return { message: `こんにちは、${name}！` }
  }
}
```

`src/greetings/controller.ts`でContractを実装し、実際の処理をProviderへ委譲します。

```ts
import { implementation, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { GreetingContract } from './contract.js'
import { GreetingService } from './service.js'

export const GreetingController = implementation({
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
```

最後に`src/app.ts`でfeatureをroot ModuleとApplication Definitionへ組み込みます。

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { GreetingController } from './greetings/controller.js'
import { GreetingService } from './greetings/service.js'

const AppModule = defineModule(() => ({
  providers: [GreetingService],
  implementations: [GreetingController],
}))

export default defineApplication({
  modules: [AppModule()],
})
```

`GreetingContract`、`GreetingService`、`GreetingController`は同じfeatureに属するため、`greetings/`の中へまとめます。`app.ts`はroot Application Graphのcompositionだけを担当し、登録対象だからという理由でfeature logicまで抱え込みません。

Application DefinitionはHTTP serverそのものではありません。Runtimeに依存しないApplication Graphを先に定義し、HTTP listenerなど実行環境固有の機能はHostから接続します。

HTTP Contractは`routes`でネストすることもできます。treeのkeyはarchitecture上のnamespaceであり、それだけではURL segmentになりません。URL prefixが必要な場合はbranchへ`path`を指定します。親branchの`path`、`pipeline`、`responses`はdescendant routeへ継承されます。

## 振る舞いをテストする

`src/app.test.ts`では内部クラスの呼び出し順ではなく、HTTP境界から観測できる振る舞いを検証します。テスト名と期待値だけで、Applicationが何を保証するのか分かる状態にします。

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import { expect, it } from 'vitest'
import application from './app.js'

it('GET /greetings/{name}は名前を含む挨拶を返す', async () => {
  // Hostをテスト間で共有しない。Application stateを持ち越さないため。
  const app = bootstrap({ application })

  try {
    const response = await app.fetch(
      new Request('http://localhost/greetings/Loutre'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      message: 'こんにちは、Loutre！',
    })
  } finally {
    await app.close('test-complete')
  }
})
```

テストを実行します。

```sh
npm run test
```

`bootstrap()`は実際のportを使わず、Web Standardの`fetch(request)`でApplicationを実行します。テスト、組み込み用途、Runtime adapterのいずれでも、同じApplication Definitionを再利用できます。

## Node.jsへ接続する

Node.js Targetの`src/main.ts`は、ApplicationをNode.js Runtimeへ接続します。

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const app = await nodeRuntime.create({ application })

await app.serve({ port: 3000 })
```

開発サーバーを起動します。

```sh
npm run dev
```

別のターミナルからリクエストを送ります。

```sh
curl http://localhost:3000/greetings/Loutre
```

```json
{ "message": "こんにちは、Loutre！" }
```

Runtimeだけを変更しても、`src/greetings/`配下のfeature codeと`src/app.ts`のApplication Definitionは変わりません。Bun、Deno、Cloudflare Workers、AWS Lambdaでは、生成された`src/main.ts`がそれぞれのRuntime adapterを接続します。

## 変更を検証して記録する

starterの`verify` scriptは、format、lint、型検査、Application Graph、テスト、Target固有のbuildをまとめて確認します。

```sh
npm run verify
```

検証が通ったら、変更したファイルの一覧ではなく、変更によって可能になったことをコミットへ残します。

```sh
git add src/app.ts src/app.test.ts src/greetings
git commit -m "feat: 名前ごとの挨拶を返せるようにする"
```

`feat: app.tsを更新する`では変更の理由を後から判断できません。履歴だけを読んでも、何のために境界や振る舞いを変えたのか分かるメッセージにします。

## ContractからHTTP Clientを作る

HTTP Contractはserverだけでなく、clientのsource of truthとしても利用できます。Implementationやhandlerの型を公開する必要はありません。

```ts
import { createHttpClient, fetchHttpTransport } from '@loutrejs/loutre/http'
import { GreetingContract } from './greetings/contract.js'

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

request型はStandard Schemaのinput、response型はStandard Schemaのoutputから導出されます。responseはContractに宣言されたstatusとschemaで実行時に検証されます。

独自の通信境界が必要な場合は、`HttpClientTransport`を実装して`createHttpClient()`へ渡します。テスト、IPC、独自のfetch policyでも、Contractから導出された同じclient surfaceを利用できます。

## Moduleの公開境界を作る

Moduleの`exports`は、Application Graph上のdependency boundaryです。別ModuleのProviderへ依存するときだけ、宣言元ModuleがProviderを`exports`し、依存元Moduleが宣言元を`imports`します。

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

同じModule内の依存関係に`exports`は不要です。importされていてもexportされていないProviderへのcross-module dependencyは、Graph compile時に`LUTRE_MODULE_VISIBILITY`で拒否されます。

## ArgumentsとTaskを定義する

Hostから受け取るstructured inputは`Arguments`、Hostが明示的に実行する処理はpublic `Task`として宣言できます。

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

export default defineApplication({
  modules: [],
  arguments: AppArgs,
  tasks: [rebuild],
})
```

HostはArgumentsを渡してからTaskを実行します。`rebuild`をexportしたのは、Hostが実行対象として参照するためです。

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import application, { rebuild } from './app.js'

const app = bootstrap({
  application,
  arguments: {
    workers: argv.workers,
  },
})

await app.run(rebuild)
await app.close('complete')
```

## 対応Runtime

次のRuntimeを継続的に動作確認しています。

| Runtime            | 検証バージョン  |
| ------------------ | --------------- |
| Node.js            | 22 / 24 / 26    |
| Deno               | 2.9             |
| Bun                | 1.3 / 1.4       |
| Cloudflare Workers | workerd         |
| Electron           | 42 / 43         |
| AWS Lambda         | Node.js 22 / 24 |

Runtimeごとの主な接続APIは次のとおりです。

```text
Node.js             nodeRuntime.create() → app.serve()
Bun                 bunRuntime.create() → app.serve()
Deno                denoRuntime.bind() / serve()
Cloudflare Workers  cloudflareWorkersRuntime.bind()
AWS Lambda          awsLambdaRuntime.bind()
Electron            electronRuntime.attach()
```

## Application Graphを調べる

`@loutrejs/cli`はApplication Graphの検査、図示、説明、deployment artifactの生成を担当します。starterには開発依存として含まれています。

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts
npm exec loutre -- graph contracts --entry src/app.ts --format mermaid
npm exec loutre -- explain GreetingService --entry src/app.ts
npm exec loutre -- doctor --runtime node --entry src/app.ts
npm exec loutre -- build src/app.ts --out-dir dist/loutre
npm exec loutre -- openapi --entry src/app.ts
```

既存プロジェクトへ追加する場合は、`@loutrejs/cli`を開発依存としてインストールします。

```sh
npm install --save-dev @loutrejs/cli
```

`build --runtime`は`aws-lambda`、`cloudflare-workers`、`deno`のdeployment entry生成に対応します。

```sh
npm exec loutre -- build src/app.ts --runtime aws-lambda
```

## 次に読む

Application Graph、Contract、Implementation、Module、Runtimeの境界を詳しく知るには、[Loutreの設計](./architecture.md)へ進んでください。用途別の実行可能な構成は、[`examples/`](../../examples/)から確認できます。
