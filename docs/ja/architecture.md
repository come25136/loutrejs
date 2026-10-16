# Loutre Architecture

Loutreは **TypeScript Application Graph Kernel** です。Applicationの構造は一度だけ`Application Model`へcompileされ、Runtime execution、CLIのGraph inspection、OpenAPI projection、deployment toolingが同じmodelを参照します。

最初のApplicationを作る場合は[Getting Started](./getting-started.md)から始めてください。

## Overview

```mermaid
flowchart TB
  code["Application code\nModules / Providers / Executions"] --> definition["Application Definition"]
  definition --> model["Application Model"]
  model --> runtime["Kernel Runtime"]
  model --> graphProjection["Graph Projection"]
  model --> tooling["CLI / OpenAPI / Build"]

  http["HTTP Extension"] --> model
  tasks["Tasks Extension"] --> model
  messagePort["MessagePort Extension"] --> model
  websocket["WebSocket Extension"] --> model

  runtime --> node["Node.js"]
  runtime --> bun["Bun"]
  runtime --> workers["Cloudflare Workers"]
  runtime --> lambda["AWS Lambda"]
  runtime --> electron["Electron"]
```

Coreが所有するのはportableなApplication concernだけです。

- Application Definitionとcanonical Application Model
- Module boundaryとProvider / DI
- EnvironmentとArguments
- Lifecycle
- active execution lifetime
- Runtime Capability identity
- generic Layer composition
- diagnosticsとGraph projection

HTTP、Task、MessagePort、WebSocket、Queue consumerなどのexecution semanticsはExecution Extensionが所有します。Coreがprotocol identityで分岐することはありません。

## Packages

| 公開package        | Role                                                         |
| ------------------ | ------------------------------------------------------------ |
| `@loutrejs/loutre` | Application Graph Kernel、DI、Lifecycle、Runtime abstraction |
| `@loutrejs/node`   | Node.js Runtime Adapter                                      |
| `@loutrejs/bullmq` | BullMQ Queue Consumer Driver                                 |
| `@loutrejs/cli`    | Graph inspection、validation、build、deployment tooling      |
| `create-loutre`    | project initializer                                          |

main packageの主要subpathは次の通りです。

公開packageとsubpathを分ける判断理由は[package配布architecture ADR](../adr/loutre_package_distribution_architecture.md)を参照してください。

| Subpath                         | Role                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `@loutrejs/loutre`              | Application、Module、DI、Lifecycle、Kernel bootstrap |
| `@loutrejs/loutre/http`         | HTTP Extension                                       |
| `@loutrejs/loutre/tasks`        | Tasks Extension                                      |
| `@loutrejs/loutre/message-port` | MessagePort Extension                                |
| `@loutrejs/loutre/websocket`    | WebSocket Extension                                  |
| `@loutrejs/loutre/graph`        | Application ModelのGraph projection                  |
| `@loutrejs/loutre/runtime`      | Runtime CapabilityとKernel runtime primitive         |
| `@loutrejs/loutre/http/openapi` | OpenAPI projection                                   |
| `@loutrejs/loutre/presentation` | startup presentation                                 |
| `@loutrejs/loutre/runtime/*`    | portable Runtime adapter                             |

## Application DefinitionとModel

`defineApplication()`はcanonical modelをその場で構築します。

```ts
const application = defineApplication({
  modules: [AppModule],
  arguments: AppArgs,
})
```

Application Definitionはlistener、timer、processを所有しません。RuntimeとToolingの唯一の正本になるcompile済み`model`を保持します。

ModuleにはProviderとExecution Definitionを登録します。

```ts
const AppModule = defineModule({
  environment: [AppEnv],
  providers: [UsersService],
  executions: [UsersHttp, heartbeat],
})
```

Execution Definitionは所有するExtensionでbrandされます。Model構築時にExtensionがdependency edge、必要Runtime Capability、compiled payload、Graph metadataをprotocol-neutralなexecution contributionへcompileします。Extensionは同じExtension内のexecution参照も公開でき、Coreがそのclosureを再帰的に辿るため、Triggerだけを登録すれば参照先Taskも自動でModelへ含まれます。compile済みModelへraw Definitionは保持しません。

## HTTP Extension

HTTP semanticsは`@loutrejs/loutre/http`が所有します。

```ts
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const UsersContract = http.contract({
  get: {
    method: 'GET',
    path: '/users/{id}',
    request: {
      params: { id: z.string() },
    },
    responses: {
      found: {
        status: 200,
        body: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
})

export const UsersHttp = http.implementation({
  name: 'UsersHttp',
  contract: UsersContract,
  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: await users.get(ctx.input.params.id),
      })
    },
  }),
})
```

routing、request decode、response finalization、middleware、authentication helper、CORS、streaming、OpenAPI metadataはHTTP Extensionの責務です。Application ModelはHTTP固有構造を解釈しません。

## Tasks Extension

Task、Trigger、Queue Consumerは`@loutrejs/loutre/tasks`が所有します。

```ts
import { fixedDelay, task } from '@loutrejs/loutre/tasks'

export const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {
    // work
  },
})

export const heartbeat = fixedDelay({
  name: 'heartbeat',
  delay: 5_000,
  immediate: true,
  task: cleanup,
})

const WorkerModule = defineModule({
  executions: [heartbeat],
})
```

Tasks executionを含むApplicationにはExtension-ownedな`tasks` Host APIが合成されます。

```ts
const app = await bootstrapApplication({ application })
await app.tasks.run(cleanup)
await app.tasks.start()
```

## MessagePortとWebSocket

MessagePortは`@loutrejs/loutre/message-port`、WebSocketは`@loutrejs/loutre/websocket`が提供し、それぞれのexecution model、runtime、Host API、Graph projectionを所有します。WebSocketはHTTP upgrade handshakeのためpublicなHTTP Extension surfaceにも依存しますが、Coreはtransport非依存のままです。

## DIとModule visibility

Providerは既定でapplication scopeです。`inject()`で宣言したdependencyはApplication Modelへ記録されます。

```ts
class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

別ModuleのProviderへ依存する場合は`exports` / `imports`を明示します。visibilityはRuntime起動前のModel構築時に検証されます。

### 独自loggerなどで依存元を取得する

`injectInquirer()`は、同期的なprovider構築中にそのproviderを直接要求したconsumerを返します。class providerとfactory providerの両方で使えます。class・custom tokenはそのtoken自体、Executionからの要求は`id`・`name`を持つdescriptorです。別名tokenで登録したconsumerでは、implementation classではなく登録tokenを返します。

```ts
import { inject, injectInquirer, provide } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'

class AppLogger {
  readonly consumer = injectInquirer()
  readonly logger = inject(Logger)
}

const loggerProvider = provide(AppLogger).useClass(AppLogger, {
  scope: 'transient',
})
```

`ServiceA`が`inject(AppLogger)`すると`AppLogger.consumer`は`ServiceA`になります。組み込みLoggerの`context.source`は従来どおり`AppLogger`です。factory providerでも`use`内から取得でき、依存は従来どおり`inject: [...]`で宣言します。

Applicationの初期構築などconsumerがいない直接解決時と注入context外では`undefined`です。application scopeは共有されるため、consumerごとのmetadataが必要ならtransientを使ってください。取得した値は構築時に保存し、非同期処理の中から取得しないでください。`injectInquirer()`はloggerのラベルなどの構築metadata専用です。Model構築時の依存収集にはconsumerが存在しないため、`inject()`するtokenや依存の有無をこの値で分岐させることはAPI contract外です。metadataを保存するコードと依存の宣言を分け、必要な依存は無条件で宣言してください。

たとえば`injectInquirer() ? inject(Repository) : undefined`は利用できません。RuntimeがModelにない依存を要求すると、解決前に`LUTRE_DI_UNDECLARED_DEPENDENCY`で拒否します。エラーには依存を要求したProviderまたはExecutionと、要求されたtokenが含まれます。依存先が既にcacheされている場合や、組み込み`Logger`の場合にも同じ規則を適用します。

### Modelの依存宣言と実行時の照合

Modelの依存宣言は、Runtimeが要求できるtokenの集合です。すべての宣言を毎回使う必要はありません。Model構築時に未解決の依存とModule visibilityを検証し、実行時に宣言外のtokenを解決させないことで、実行時だけのprivate依存を防ぎます。Model構築時に通らなかった分岐は、実際にその分岐を実行した時点で拒否されます。

| 構築対象                    | 宣言する依存                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| class provider              | 同期構築中の`inject()`から収集したtoken。登録tokenを依存元として照合します。                       |
| factory provider            | 明示的な`inject: [...]`配列。`use`内の`inject()`は`LUTRE_DI_CONTEXT`で拒否します。                 |
| conditional provider        | 選択元のEnv / Args contractと、全候補classの依存の和集合。未選択の候補もvisibility検証の対象です。 |
| Execution / HTTP Layer      | ExtensionがModelへ収録したExecutionの`dependencies`。HTTP Layerの依存は所属Executionに含めます。   |
| value / Env / Args provider | 構築中の動的な依存はありません。                                                                   |

組み込み`Logger`などframework-provided tokenも、通常のtokenと同様に依存宣言が必要です。frameworkによる提供はProvider登録の省略を可能にするもので、宣言照合の免除ではありません。Lifecycle hookの依存は従来どおり明示的な`inject`配列で宣言します。

独自Execution Extensionの`createRuntime`とHostの`create`は、`executions`として`ExecutionRuntimeBinding`の配列を受け取ります。各bindingの`execution`はcanonical ModelのExecutionへの参照、`resolve`はそのExecutionの依存宣言にKernelが束縛したresolverです。`const { execution, resolve } = executions[0]`のように取り出し、`resolve(token)`で解決します。Injection Contextからは`resolve(token, { consumer })`、Layerからは同じresolverを使います。照合するExecutionのIDを解決のたびに指定する必要はありません。

`resolve`の既定の`source`はExecutionのIDです。任意の`source`はログ・診断用、`consumer`は構築metadata用で、どちらを指定しても照合する依存宣言は変わりません。`applicationRuntime`は実行・操作の追跡を担当し、依存解決の入口を持ちません。bindingはApplicationのRuntimeが所有し、Modelへresolverや実行状態を保存しません。Application停止後に保持していたresolverを呼ぶと`LUTRE_APPLICATION_STATE`で拒否します。

単独の低水準`Container`にはModelがないため、宣言照合には`ContainerOptions.dependencies`でModelのProvider依存一覧を渡す必要があります。Application経由ではKernelが必ず設定します。

## EnvironmentとArguments

Runtime inputはtyped contractとして宣言し、Provider constructionより先にbindします。

```ts
class AppEnv extends defineEnv(
  z.object({ PORT: z.coerce.number().int().positive() }),
) {}

const AppModule = defineModule({
  environment: [AppEnv],
})
```

Runtime adapterが実環境のsourceを渡し、testやembedded executionでは`bootstrapApplication()`へ明示sourceを渡せます。

## RuntimeとLifecycle

portableなKernel-hosted Applicationは`bootstrapApplication()`で起動します。

```ts
const app = await bootstrapApplication({ application })
```

Runtime adapterはその外側でplatform ownershipを追加します。Node.js / BunではHTTP listenerとprocess signalの終了フックをadapterが所有し、HTTPを持たないworkerにも同じ終了処理を適用します。`create({ shutdownHooks: false })`で終了フックを無効にできます。

```ts
const app = await nodeRuntime.create({ application })
await app.serve({ port: 3000 })
```

shutdownはExtension-owned workとactive executionをdrainし、active executionが0になってからExtension runtimeをcloseします。その後のProvider lifecycle cleanupは`onModuleDestroy`、`beforeApplicationShutdown`、`onApplicationShutdown`の順で実行します。drainの成否にかかわらずactive executionの待機が`forceShutdownTimeoutMs`を超えた場合は、利用中のProviderをcleanupせずApplicationを`draining`に保ちます。

## GraphとTooling

CLIはApplication Definitionのcompile済みmodelを読み、別のarchitecture representationを再構築しません。

```sh
loutre check --entry src/app.ts
loutre graph modules --entry src/app.ts
loutre graph di --entry src/app.ts --format mermaid
loutre graph executions --entry src/app.ts --format json
loutre doctor --entry src/app.ts --runtime node
```

OpenAPIもExecution Extensionのprojectionです。CoreはHTTP route semanticsを知りません。

Provider構築、Module正規化、終了フックの責務を分けた判断は[所有権ADR](../adr/loutre_construction_and_runtime_ownership.md)を参照してください。

## Design invariant

canonical Application Modelは一つだけです。Runtime adapter、CLI、build、Graph projection、Execution ExtensionがApplicationの並行modelを持つことはありません。
