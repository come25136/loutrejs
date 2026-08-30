# Loutre Architecture

この文書は、Loutreを構成する公開境界と、その境界を分ける理由を説明します。利用手順は[getting started](./getting-started.md)、具体的な振る舞いは公開型とテスト、個別の判断履歴はADRを正本とし、ここでは現在のApplication modelを俯瞰できることを優先します。

## 全体像

Loutreは、Runtimeから独立したApplication DefinitionをApplication Graphへcompileし、同じGraphをType System、Runtime、Toolingから利用するTypeScript Application Frameworkです。

```text
Application code
  ├ Contract / Protocol / Implementation
  ├ Module / Provider
  ├ Environment / Arguments
  ├ Task / Trigger
  └ Pipeline / Context
             │
             ▼
     Application Definition
             │ compile
             ▼
       Application Graph
        ┌────┼──────────┐
        ▼    ▼          ▼
      Types Runtime   Tooling
             ▲
             │ bind
      Host / Runtime Adapter
```

中心となる原則は次のとおりです。

- Applicationは一種類のportableなDefinitionとして宣言する
- Protocol、public Task、TriggerをExecution RootとしてGraphへ載せる
- Frameworkが管理する依存関係は明示し、実行ごとのdataはtyped Contextで渡す
- Application codeからlistener、process、deploymentなどRuntime固有の責務を分離する
- 利用できないexecution capabilityは、可能な限りTypeScriptのAPI surfaceへ公開しない
- Graphのためのconstructionは同期的かつ副作用なしで完了させる

Graphを中心に置くことで、型が理解している構成、Runtimeが実行する構成、CLIが検査する構成を別々に再定義せずに済みます。

## 公開パッケージ

利用者が直接扱うdistributionは、次の五つです。

| Package            | 責務                                             |
| ------------------ | ------------------------------------------------ |
| `@loutrejs/loutre` | Application Definition、Graph、Runtime、Protocol |
| `@loutrejs/node`   | Node.js Runtime Adapter                          |
| `@loutrejs/bullmq` | BullMQ Queue Consumer Driver                     |
| `@loutrejs/cli`    | Graph検査、build、OpenAPI生成                    |
| `create-loutre`    | TargetごとのApplication starter生成              |

`@loutrejs/loutre`は、関心ごとのsubpathを公開します。

| Subpath                         | 公開境界                                |
| ------------------------------- | --------------------------------------- |
| `@loutrejs/loutre`              | Core、Module、DI、Task、Trigger         |
| `@loutrejs/loutre/host`         | Runtime-neutralな`bootstrap()`          |
| `@loutrejs/loutre/binding`      | Host、invocation、resource binding      |
| `@loutrejs/loutre/graph`        | Application Graphとdiagnostics          |
| `@loutrejs/loutre/runtime`      | Runtime、Lifecycle、Capability metadata |
| `@loutrejs/loutre/http`         | HTTP Protocol、Layer、Client            |
| `@loutrejs/loutre/message-port` | MessagePort Protocol                    |
| `@loutrejs/loutre/openapi`      | OpenAPI 3.2生成                         |
| `@loutrejs/loutre/presentation` | 起動時presentation                      |
| `@loutrejs/loutre/runtime/*`    | RuntimeごとのAdapter                    |

Compiler専用packageは置きません。Graphの成立にTypeScript compiler API、decorator metadata、`reflect-metadata`を要求すると、Applicationの実行と解析が特定のbuild環境へ結びつくためです。

## Application Definition

`defineApplication()`は、Applicationを構成する要素への参照だけを持つside-effect freeなDefinitionを返します。

```text
Application Definition
├ modules[]
├ arguments?
├ tasks[]
├ triggers[]
└ logger?
```

Definition自身は`init()`、`run()`、`fetch()`、`listen()`、`close()`を持ちません。Definitionを評価しただけでlistenerやtimerが始まると、Graph inspection、テスト、deployment向けbindingが同じ入口を利用できなくなるためです。

Application Definitionは構成を表し、実行可能なApplication objectはHostまたはRuntime Adapterが作ります。

### Contract、Protocol、Implementation

ContractはProcedureの集合です。各ProcedureはProtocol descriptorを持ち、入力、応答、Pipeline、dispatch identityを静的に宣言します。

ProtocolはHTTPやMessagePortなどのinteractionと、dispatchやfinalizationの規則を所有します。CoreとGraphはProtocol固有のroute grammarを解釈せず、Protocolが提供するdescriptorを扱います。

Implementationはclassの別名ではなく、static descriptorと同期factoryの組です。

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: await users.get(ctx.params.id),
      })
    },
  }),
})
```

Descriptorから対象ContractとProtocolを解析でき、factoryからDependency Graphを収集できます。`Controller`や`Handler`はApplication側の命名として利用できますが、Coreの別component typeにはしません。

Factoryは同期的にprocedure objectを返し、procedure自体は非同期で実行できます。Implementation runtimeはApplicationRuntimeごとに一度構築してcacheし、requestやmessageごとには再生成しません。

共有resourceとLifecycleが必要な処理はProviderへ置きます。ImplementationをLifecycle participantとして兼用すると、Protocolの実装とresource ownershipが同じobjectへ混ざるためです。

### Module

Moduleは、Applicationをfeature単位で構成する境界です。

```text
Module
├ imports
├ environment
├ providers
├ implementations
├ exports
├ lifecycle
└ required capabilities
```

別ModuleのProviderへ依存する場合、宣言元はProviderを`exports`し、依存元はModuleを`imports`します。同じModule内の依存関係に`exports`は不要です。

この可視性をGraph compile時に検証することで、TypeScript上で参照できることと、Applicationとして依存を公開していることを区別します。

### ProviderとDependency Injection

ProviderはApplicationが所有するresourceです。class、value、factory、conditional、Environment、Argumentsを同じDependency Graphへ載せます。通常のscopeは`application`、必要な場合だけ`transient`を選びます。

class tokenとcustom tokenは、同じ`inject()`で宣言します。

```ts
const DATABASE = token<Database>('database')

class UserRepository {
  constructor(readonly database = inject(DATABASE)) {}
}
```

constructor default parameterをcanonicalな依存宣言にすることで、FrameworkはGraphを収集でき、unit testは明示argumentで依存を差し替えられます。DecoratorやTest Containerを必須にしません。

Factory Providerの依存関係は`inject` metadataで宣言します。

```ts
provide(CACHE).useFactory({
  inject: [Config],
  use: (config) => new Cache(config),
})
```

`inject()`はService Locatorではなく、Frameworkが管理する同期construction中だけ有効です。Procedure bodyから任意のdependencyを取得できる設計にすると、実行時にしか現れないedgeがGraphの外へ漏れるためです。

request、session、current user、tenant、permissionsなど実行ごとのdataはDIへ入れず、Context KeyとPipelineで渡します。

### 同期construction

Provider constructor、Provider factory、Implementation factory、Layer factory、Task factoryは同期的に完成します。非同期処理は、完成したruntime functionまたはLifecycleで実行します。

同期constructionを保つ理由は、object invariantとDependency Graphを同じ時点で確定するためです。Graph Probeでもconstructorやfactoryを実行するので、次の処理はconstructionへ置きません。

- network I/O
- listenerやlong-running timerの開始
- process-wideなmutable stateの変更
- business operation

これらはLifecycle、Task、Trigger、Protocol executionへ置きます。

## Runtime Input

Application codeは、Runtimeから受け取るraw valueを直接読みません。EnvironmentとArgumentsが、HostのinputをApplicationの型へ変換します。

### Environment

Environmentは`process.env`のwrapperではなく、Raw Runtime EnvironmentからApplication Environmentへの変換Contractです。Standard Schemaでvalidateとtransformを行います。

```ts
const AppEnvSchema = z
  .object({
    DATABASE_URL: z.string(),
    STORAGE_DRIVER: z.enum(['memory', 's3']),
  })
  .transform((raw) => ({
    databaseUrl: new URL(raw.DATABASE_URL),
    storageDriver: raw.STORAGE_DRIVER,
  }))

class AppEnv extends defineEnv(AppEnvSchema) {}
```

Moduleは必要なEnvironment Contractを宣言します。`AppEnv.key()`はraw keyではなく、transform後のoutput keyを参照します。

Runtime Adapterは、それぞれのHostで自然なEnvironment sourceを既定値として渡します。

| Runtime Adapter                   | 既定のsource                  |
| --------------------------------- | ----------------------------- |
| `nodeRuntime.create()`            | `process.env`                 |
| `bunRuntime.create()`             | `Bun.env`                     |
| `denoRuntime.bind()` / `create()` | `Deno.env.toObject()`         |
| `cloudflareWorkersRuntime.bind()` | Workerの`environment`         |
| `awsLambdaRuntime.bind()`         | `process.env`                 |
| `electronRuntime.attach()`        | 利用可能な場合は`process.env` |

明示的な`environment`が渡された場合は、その値を優先します。Application sourceがHost固有のEnvironment APIを直接読む構成は、Runtime portabilityを失うためcanonicalにしません。

### Arguments

Argumentsは、HostがApplicationをどのinputで起動したかを表すstructured inputです。Applicationは0個または1個のArguments Contractを持ちます。

```ts
class AppArgs extends defineArgs(
  z.object({
    workers: z.number().int().positive(),
  }),
) {}

const application = defineApplication({
  modules: [],
  arguments: AppArgs,
})
```

ArgumentsもStandard Schemaでvalidateとtransformを行い、ProviderとしてDependency Graphへ載ります。required inputがある場合、Host optionsの`arguments`も型レベルで必須になります。

EnvironmentとArgumentsのraw valueはRuntimeのinputであり、Graph生成のinputにはしません。Graph Probeがsecretやdeployment固有値へ到達した場合は、diagnostic errorにせずopaque boundaryで停止します。

## Execution Root

Application Graphで実行の入口になるのは、Protocol、public Task、Triggerです。

```text
Execution Root
├ Protocol procedure
├ Public Task
└ Trigger
   ├ cron
   ├ fixed-delay
   └ queue-consumer
```

### Task

Taskは、Hostが明示的に実行できる処理です。static descriptorと同期factoryからなり、factoryが返すruntime functionは非同期にできます。

```ts
const processOrder = task<Order, void>({
  name: 'orders.process',
  factory:
    (service = inject(OrderService)) =>
    async (order) => {
      await service.process(order)
    },
})
```

`Application.tasks`へ登録したTaskだけをpublicとし、Hosted Applicationの`run()`から実行できます。Triggerからだけ参照されるTaskはGraphとRuntimeへ登録しますが、public APIには公開しません。

public Taskを持たないApplicationから`run()`を型surfaceごと消すことで、実行できないoperationをRuntime errorではなく利用時に検出できます。

### Trigger

TriggerはTaskを自動実行する入口です。

- cronは5-field expressionとIANA timezoneを持ち、overlap policyを選ぶ
- fixed-delayは前回のexecution完了後から次のdelayを数える
- queue-consumerはStandard Schemaでpayloadを検証してからTaskへ渡す

Queueはvendor-neutralなlogical resourceとしてCoreへ置き、受信処理はDriver bindingへ分離します。Producer固有option、retry、delayed publishまでCoreで標準化すると、transportの差を不完全な共通APIへ押し込めるためです。

## PipelineとContext

Pipelineは、Protocol procedureの実行順序とContextの変化をGraphへ表します。Layer、Validation、Terminalを再帰的に構成できます。

```text
Pipeline
├ Layer
├ Layer
│  └ child Pipeline
│     ├ Validation
│     └ Layer
└ Terminal
```

Layerはstatic metadataと同期factoryを持ちます。

```ts
const auth = layer({
  name: 'auth',
  requires: [SESSION],
  provides: [CURRENT_USER],
  factory:
    (users = inject(UserService)) =>
    async (ctx, next) => {
      const currentUser = await users.resolve(ctx.session)
      await next({ currentUser })
    },
})
```

`requires`はLayerが読むContext Key、`provides`は後段へ追加するContext Keyを宣言します。Runtimeは未宣言のproperty、required valueの不足、Context Keyの重複、既存Contextの暗黙上書きを拒否します。

正常なLayerは`next()`を一度だけ呼ぶか、`shortCircuit()`で終了します。Pipeline全体のTerminalも一つに限定します。この制約により、Graphに宣言した実行順序とRuntimeの制御フローが一致します。

Contextはexecution dataを運びます。Dependency GraphのresourceとContextのdataを分けることで、Provider lifetimeとrequest lifetimeを混同しません。

## Application Graph

Application Graphは、Definitionから得られるstatic descriptorと、同期constructionを観測するGraph Probeを統合して作ります。

```text
Application Definition
        │
        ├ Descriptor traversal ── Declared nodes / edges
        │
        └ Graph Probe ─────────── inject() nodes / edges
                         │
                         ▼
                 Application Graph
```

### Declared Graph

Module imports、Provider Factoryの依存metadata、Contract、Pipeline、Task、Trigger、Capabilityなど、factoryを実行せずに読める構成を収集します。

### Graph Probe

class、Implementation、Layer、Taskのdefault parameterにある`inject()`は、Probe用Containerで同期constructionしてedgeを記録します。Graph ProbeはLifecycleを実行せず、ApplicationRuntimeも起動しません。

同じconstructorやfactoryはGraph ProbeとRuntime initializationで別々に実行される可能性があります。そのためconstructionへI/Oやprocess-wideな副作用を置かず、外部resourceの開始はLifecycleへ分離します。

EnvironmentやArgumentsのconcrete valueがないと先へ進めない依存はopaque boundaryとして扱い、取得済みのnodeとedgeは保持します。Graph ProbeはJavaScriptのsymbolic interpreterではないため、dependency topologyをimperativeなruntime branchへ隠しません。

### Graphの利用者

Graphは少なくとも次の関係を表します。

- Moduleと公開境界
- Provider、token、Context Key
- Contract、Pipeline、Implementation
- Task、Queue、Execution Root
- Capability requirementとHost Capability
- diagnostics

unresolved dependencyやcycleがあっても、取得できた構成とdiagnosticsをpartial graphとして返せます。CLIの`graph`、`check`、`explain`、`doctor`は同じcompile結果を利用します。

Graphの公開shapeはLoutre本体のPublic APIとしてversioningします。Graphだけに別の互換性ルールを持たせません。

## BindingとHost

Definitionを実行可能なApplicationへ変える境界がBindingです。

```ts
binding.invocation({ application, environment, arguments })
binding.host({ application, environment, arguments })
binding.queue(queue, driver)
```

`binding.invocation()`はcallbackやtransport binding向けで、Protocol executionとApplicationRuntimeを返します。Trigger Engineは所有しません。

`binding.host()`はlong-livedなHost向けで、必要な場合にTrigger Engineを追加します。

`bootstrap()`はRuntime-neutralなHost primitiveで、内部では`binding.host()`を利用します。HTTP listenerは所有せず、Web Standardの`fetch(request)`でHTTP-capable Applicationを実行します。

Hosted Applicationのbase surfaceは`graph`、`get()`、`init()`、`close()`です。Definitionに応じて、利用可能なoperationだけを追加します。

```text
public Taskあり  → run(task, ...args)
HTTPあり         → fetch(request)
Host + Trigger   → triggers.start() / triggers.stop()
```

Listenerをgeneric Hostへ置かないのは、Node.js、Bun、Deno、Worker、Lambdaでownershipとshutdown方法が異なるためです。

## Runtime Adapter

Runtime Adapterは、Host固有APIとLoutreのBindingを接続します。

| Runtime            | Public API                        | 所有する境界                   |
| ------------------ | --------------------------------- | ------------------------------ |
| Node.js            | `nodeRuntime.create()`            | Node HTTP server               |
| Bun                | `bunRuntime.create()`             | `Bun.serve()`                  |
| Deno               | `denoRuntime.bind()` / `create()` | fetch binding / `Deno.serve()` |
| Cloudflare Workers | `cloudflareWorkersRuntime.bind()` | Worker `fetch`                 |
| AWS Lambda         | `awsLambdaRuntime.bind()`         | buffered / streaming handler   |
| Electron           | `electronRuntime.attach()`        | MessagePort                    |

Node.js、Bun、Denoの`create()`はApplicationを初期化し、`serve()`でlistenerとTriggerを開始します。`close()`はlistener停止、active executionのdrain、Application shutdownをまとめて行います。

Cloudflare Workers、AWS Lambda、Electronのようなcallback Runtimeは、Application sourceではなくHost entryでbindingします。deployment形式をApplication Definitionへ混ぜないためです。

### Capability

Runtime固有機能はCapabilityとしてApplication Graphへ記録し、Runtime Adapterが提供するCapabilityと照合します。

CapabilityはApplication全体のrequirementと、特定Execution Rootのrequirementを区別します。CLIの`doctor`はGraphと選択RuntimeのCapability setを比較します。

Capability metadataとAdapter実装は分離できます。たとえばNode.jsのmetadataを読むためにNode.js built-in moduleまで評価すると、BunやDenoでのinspectionがNode.js実装へ依存するためです。

## InitializationとLifecycle

Graph inspectionはApplicationRuntimeを起動しません。BindingがRuntime shellを作り、`init()`または最初のexecutionで初期化を完了します。

```text
Definition evaluation
        ↓
Graph compile / Probe
        ↓
Environment / Arguments binding
        ↓
Schema validation / transform
        ↓
Runtime factory preparation
        ↓
Provider / Module initialization
        ↓
Application ready
```

Lifecycle participantはapplication-scoped ProviderとModule lifecycleです。transient Provider、Environment、Arguments、Implementation、Layer、Task runtimeは自動的なLifecycle participantにしません。

Providerは次のmethod-based hookを実装できます。

```text
onModuleInit
onApplicationBootstrap
onModuleDestroy
beforeApplicationShutdown
onApplicationShutdown
```

Runtimeはactive executionを追跡します。

```text
CREATED → INITIALIZING → RUNNING → STOPPING → STOPPED
                            │          │
                            │          ├ 新しいexecutionを拒否
                            │          └ active executionを待機
                            └ Protocol / Task / Trigger execution
```

`init()`と`close()`はidempotentです。初期化途中で失敗した場合は、開始済みresourceを逆順でcleanupします。複数のcleanup errorは`AggregateError`へ集約し、最初のerrorだけで残りの破棄を止めません。

## Protocol

Protocolは、ContractのProcedureを外部interactionへ接続します。Implementationはtransport固有responseを直接構築せず、logical resultを返します。Protocol finalizationがschema validation、serialization、streaming、transport responseの生成を担当します。

### HTTP

HTTP ProtocolはWeb Standardの`Request`と`Response`を境界に使います。

- path、query、headers、bodyをdecodeする
- `validate.*`を置いたPipeline位置でStandard Schemaによるrefinementを行う
- methodとnormalized pathからdispatch identityを作る
- logical responseを宣言済みstatusとschemaで検証してfinalizeする
- request abort時にstream iteratorをcleanupする

Path parameterはsegment単位で宣言し、validation前はraw `string`として扱います。`request.params`へSchemaを書いただけでは自動変換せず、Pipeline上の`validate.params`を明示的なrefinement boundaryにします。

CORSやBasic AuthはHTTPの外側へ特別処理として埋め込まず、Layerとtyped Contextで構成します。Validation errorやpreflightを含むfinalizationはHTTP Protocolが所有します。

### MessagePort

MessagePortもHTTPと同じImplementation、Pipeline、Layer、ApplicationRuntimeを利用します。独立したApplication modelは作りません。

`messagePort.handler`がTerminalとなり、Implementationはlogical MessagePort resultを返します。Electron Runtime AdapterはProtocol executionをElectron MessagePortへattachします。

Protocolごとにtransportは異なっても、Application compositionとDependency Graphを共有することがLoutreの境界です。

## Tooling

Loutre CLIはApplicationを起動するHostではありません。Application DefinitionをloadしてGraphをcompileし、次の用途へ利用します。

- `graph`でModule、DI、Contract、Execution、Runtimeの関係を表示する
- `check`でGraph diagnosticsを検査する
- `explain`で特定nodeへの依存経路を説明する
- `doctor`でRuntime Capabilityを照合する
- `build`でApplication bundleとdeployment entryを生成する
- `openapi`でOpenAPI 3.2 documentを生成する

Graph inspectionとOpenAPI生成はApplicationRuntime initializationを要求しません。CLIが`run`、`dev`、`start`を所有しないのは、argv parsing、listener、process lifecycleがHostの責務だからです。

deployment向けbuildはRuntime-specific entryをHost側へ生成します。AWS Lambda、Cloudflare Workers、DenoへのbindingをApplication sourceへ書き戻しません。

## 関連資料

最初のApplicationを作る場合は[getting started](./getting-started.md)、実行可能な構成を確認する場合は[`examples/`](../examples/)を参照してください。設計判断の経緯や採用しなかった案は`docs/adr/`に記録します。
