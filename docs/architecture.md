# Loutre Architecture

- 状態: **Loutre v0.x architecture source of truth**
- 対象: Loutre v0.x
- 更新日: 2026-08-29 JST

## 0. Source of Truth

この文書を Loutre v0.x の architecture 上の source of truth とする。

優先順位は次のとおり。

```text
この architecture.md
        ↓
現行 develop の実コード / public type tests / runtime conformance
        ↓
個別の ADR / design / handoff docs
```

---

## 1. Architecture Principle

Loutreは、portableな **Application Definition** と明示的な **Application Graph** を中心に、Contract、Protocol、Implementation、Task、Trigger、Pipeline、DI、Environment、Arguments、Lifecycle、Runtime Capabilityを統一的に扱うTypeScript Application Frameworkである。

```text
                 Loutre

             Application Graph
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   Type System    Runtime      Tooling
                                │
                                ├ graph
                                ├ check
                                ├ explain
                                ├ doctor
                                ├ build
                                └ openapi
```

設計原則は次とする。

> **Graph-first, type-safe runtime.**

> **Applicationは一種類のportable Definitionとして宣言し、Protocol / Task / TriggerをExecution RootとしてGraphへ載せる。**

> **存在しないexecution capabilityは、可能な限りTypeScriptのAPI surfaceから消す。**

> **Framework-managed dependencyは明示し、execution dataはtyped Contextで渡す。**

> **Application codeからruntime固有APIを分離し、起動方法はHost / Runtime Adapterが所有する。**

> **同期的に完成できるobject invariantをframework都合で`undefined`へ落とさない。**

> **Graph Probeが自然なconstructor / factory設計を歪めてはならない。**

---

## 2. Distribution / Public Boundary

公開distributionは4 packageに限定する。

```text
@loutrejs/loutre
@loutrejs/node
@loutrejs/bullmq
@loutrejs/cli
```

`@loutrejs/loutre` は内部architecture boundaryをsubpath exportとして公開する。

```text
@loutrejs/loutre
├ Core / Application Definition
├ Task / Trigger / Queue
├ Environment / Arguments
├ Module / Provider / DI descriptor
└ binding namespace

@loutrejs/loutre/host
└ runtime-neutral bootstrap

@loutrejs/loutre/binding
└ Application / runtime / resource binding

@loutrejs/loutre/graph
├ ApplicationGraphIR v5
├ Graph Probe
└ semantic validation

@loutrejs/loutre/runtime
├ ApplicationRuntime
├ DI Container
├ Lifecycle / execution gate
├ Pipeline runtime
├ Runtime Capability
└ Node capability metadata

@loutrejs/loutre/http
├ HTTP Protocol
├ path / params / validation
├ HTTP Layer
└ HTTP protocol execution

@loutrejs/loutre/message-port
├ MessagePort Protocol
└ MessagePort protocol execution

@loutrejs/loutre/openapi
└ OpenAPI 3.2 generation

@loutrejs/loutre/runtime/bun
@loutrejs/loutre/runtime/deno
@loutrejs/loutre/runtime/cloudflare-workers
@loutrejs/loutre/runtime/aws-lambda
@loutrejs/loutre/runtime/electron
└ runtime adapter

@loutrejs/node
└ Node.js runtime adapter

@loutrejs/bullmq
└ BullMQ Queue Consumer Driver binding

@loutrejs/cli
├ graph / check / explain / doctor
├ build
└ openapi
```

`@loutrejs/compiler` packageは存在しない。

Core / Graph / Runtimeの成立にTypeScript compiler API、`emitDecoratorMetadata`、`reflect-metadata`、Node.js固有DI primitiveを要求しない。

---

## 3. Contract / Protocol / Implementation

### 3.1 Contract と Protocol

`Contract`はProcedureの集合であり、各ProcedureがProtocol descriptorを持つ。

`ProtocolDescriptor`はprotocol名、interaction、dispatch identity、capability等のstatic metadataを持つ。
Protocol固有のdispatch identityはProtocol packageが生成し、Core / Graphはその文字列の内部grammarを解釈しない。

同一Contract内の非null `dispatchKey` 重複はdefinition時に拒否し、Application全体の重複はGraph compileで検出する。

### 3.2 Implementation は class ではない

Contract Implementationのcanonical modelは **static descriptor + synchronous factory** である。

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({ body: await users.get(ctx.params.id) })
    },
  }),
})
```

`Controller` / `Handler`はApplication上の呼称や変数名として使ってよいが、Coreの別component typeではない。

Implementation descriptorは次を持つ。

```text
kind = implementation
name
contract
protocol
capabilities
procedures
factory
```

`procedures`省略時は指定Protocolを持つContract procedures全体へdefinition時にnormalizeする。
Factory resultは選択procedureをcallable propertyとして持つnon-null objectでなければならない。
Factory自体がthenableを返すことは禁止し、Procedure functionがasyncなのは合法である。

### 3.3 Implementation lifetime

Implementation runtime objectはApplicationRuntimeごとに1つ構築してcacheする。
request / messageごとに再生成しない。

同じfactoryはGraph Probeと実Runtime initializationで別々に実行され得る。
Implementation descriptor / runtime objectはDI tokenではなく、Provider Lifecycle participantにも自動登録しない。
Lifecycleを必要とする共有resourceはProviderへ分離する。

---

## 4. Module / Provider / Dependency Injection

### 4.1 Module

現行`ModuleDefinition`は概念的に次を持つ。

```ts
interface ModuleDefinition {
  readonly name?: string
  readonly description?: string
  readonly imports?: readonly ModuleInstance[]
  readonly environment?: readonly EnvClass[]
  readonly providers?: readonly ProviderDeclaration[]
  readonly implementations?: readonly ImplementationDescriptor[]
  readonly exports?: readonly unknown[]
  readonly lifecycle?: ModuleLifecycle
  readonly requires?: readonly string[]
}
```

ModuleはImplementation descriptorだけを知ればよく、ContractとImplementationの関係を別APIで再宣言しない。
`defineModule()`は`environment`宣言からframework-managed Environment Providerを合成し、同じEnvClassをdedupeする。

### 4.2 Provider

Providerのcanonical kindsは次。

```text
class
value
factory
conditional
environment
arguments
```

Scopeは`application | transient`。

classを`providers: [Service]`と直接置いた場合はapplication-scoped class providerへnormalizeする。
Value Providerはapplication scope。
Factory Providerはdependencyを`inject` metadataで明示する。

```ts
provide(CACHE).useFactory({
  inject: [Config],
  use: (config) => new Cache(config),
})
```

Conditional ProviderはEnvironmentまたはArgumentsのruntime input keyでcandidate classを選ぶ。

```ts
provide(STORAGE).select(AppEnv.key('storageDriver'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
```

Graphは現在選択されていないcandidateも含めてtopologyを保持する。

### 4.3 `inject()`

class tokenとcustom tokenは同じ`inject()`で解決する。

```ts
const DATABASE = token<Database>('database')

class UserRepository {
  constructor(readonly database = inject(DATABASE)) {}
}
```

class dependencyのcanonical formはconstructor default parameterである。
明示argumentを渡せばdefault initializerは評価されないため、unit testでTest Containerを要求しない。

`@Injectable()`、class dependency用`@Inject()`、`experimentalDecorators`、`emitDecoratorMetadata`、`reflect-metadata`は要求しない。

`inject()`はService Locatorではなく、framework-managedな同期construction中だけ利用できる。

```text
inject(token)
    ├ dependency declaration
    ├ synchronous dependency resolution
    └ consumer → dependency edge recording
```

主なconsumerは次。

- Provider class constructor
- Layer factory
- Implementation factory
- Task factory

procedure bodyや通常のApplication処理からの`inject()`は`LUTRE_DI_CONTEXT`で失敗する。
Injection Contextは同期stack + `try/finally`で復元し、DIのために`AsyncLocalStorage`を要求しない。

### 4.4 Execution data は DI ではない

request、session、current user、tenant、permissions、request/message固有state等はDIへ入れない。
typed `ctx` / Context Key / Pipelineで扱う。

### 4.5 Construction は同期

Container resolution、class constructor、Provider factory、Layer factory、Implementation factory、Task factoryは同期である。
Factoryがthenableを返す場合はfail-fastする。

一方で、同期的に完成できるobject invariantはconstructor / factoryで完成させてよい。
Graph Probeでもconstructor / factoryが実行されるため、network I/O、listener起動、long-running timer起動、process-wide mutable side effect、business operationはconstructionへ置かない。

---

## 5. Runtime Input: Environment / Arguments

### 5.1 Environment

Environmentは`process.env` wrapperではなく、**Raw Runtime Environment → Application Environment**の変換Contractである。
Standard Schemaをそのまま利用する。

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

`defineEnv()`のschema outputはobjectでなければならない。
`AppEnv.key()`はraw keyではなくtransform後output keyを参照する。

Environment ContractはModuleが0..N個宣言する。

```ts
const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [Database],
}))
```

### 5.2 Arguments

ArgumentsはHostがApplicationをどう起動するかを表すstructured inputである。
Applicationが0..1個のArguments Contractを持つ。

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

ArgumentsもStandard Schemaでvalidate / transformし、`inject(AppArgs)`と`AppArgs.key()`を利用できる。
Graph上では`kind: 'arguments'`のframework-managed Provider / dependency nodeとして表現する。

required inputを持つArguments Contractでは、`bootstrap()`やruntime adapterのoptionsで`arguments`が型レベル必須になる。
Schema inputが空objectで成立する場合は省略できる。

### 5.3 Raw source ownership

runtime-neutralな`bootstrap()` / `binding.host()` / `binding.invocation()`は、`environment`が明示された場合だけそのsourceをApplicationRuntimeへ渡す。
Environment Contractを持つApplicationでsourceが供給されない場合は`LUTRE_ENV_005`になる。

runtime adapterは各Hostの自然なEnvironment sourceを既定値として利用する。

| Runtime adapter                   | 既定Environment source                       |
| --------------------------------- | -------------------------------------------- |
| `nodeRuntime.serve()`             | `process.env`                                |
| `bunRuntime.serve()`              | `Bun.env`                                    |
| `denoRuntime.bind()` / `serve()`  | `Deno.env.toObject()`                        |
| `cloudflareWorkersRuntime.bind()` | `fetch(request, environment)`の`environment` |
| `awsLambdaRuntime.bind()`         | `process.env`                                |
| `electronRuntime.attach()`        | 利用可能なら`process.env`                    |

すべて明示`environment`でoverrideできるruntimeについては、その明示値を優先する。
Application source自体からHost固有Environment APIを直接読む構成をcanonicalにしない。

Graph Probe中のEnvironment concrete value accessはuser-facing diagnosticではなく、内部Probe Boundaryとして扱う。
Schema validation failureのframework messageにraw secret valueを含めない。

---

## 6. Application Definition / Task / Trigger

### 6.1 Application Definition

`defineApplication()`はside effectを持たないportable Definitionを返す。

```ts
const application = defineApplication({
  modules: [AppModule()],
  arguments: AppArgs,
  tasks: [rebuildIndex],
  triggers: [nightlyCleanup, pollRemoteState, orderConsumer],
  logger,
})
```

現行`ApplicationDefinition`が持つcompositionは次。

```text
Application Definition
├ modules[]
├ arguments?   # 0..1
├ tasks[]       # public Task roots
├ triggers[]    # automatic roots
└ logger?
```

Definition自体には`init()` / `run()` / `fetch()` / `listen()` / `triggers` / `close()`を生やさない。
listener ownershipはApplication DefinitionではなくHost / Runtime Adapterが持つ。

### 6.2 Task

Taskは **static descriptor + synchronous factory** である。

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

Task factoryは同期でruntime functionを返す。runtime function自体はasyncでよい。
同一ApplicationRuntimeではTask runtimeを1度だけprepare/cacheする。

`Application.tasks`へ登録したTaskだけがpublic Taskであり、Applicationの`run(task, ...args)`から実行できる。
Triggerからだけ参照されるTaskはruntime登録・Graph Probe対象にはなるが、public `run()` surfaceには含めない。

public Taskが0件のApplicationには`run`自体を型surfaceへ公開しない。

### 6.3 Trigger

Triggerのcanonical kindは次。

```text
cron
fixed-delay
queue-consumer
```

Cronは5-field cron expression + IANA timezoneを持ち、overlap policyは`skip | allow`。
Cronが参照できるTask inputは`void`。

Fixed-delayはnon-negative finite integerのdelayを持ち、`immediate`を指定できる。
execution完了後にdelayを開始するため、同一Trigger自身はoverlapしない。
参照できるTask inputは`void`。

Queueはvendor-neutralなlogical resourceで、payloadにStandard Schemaを必須とする。
Queue ConsumerはQueue payloadとTask inputが双方向に互換であることを型で要求する。
Queue Consumer Driverが受信したunknown payloadをvalidateしてからTaskへ渡す。

transport固有のproducer / delayed publish / retry option等はCoreで標準化しない。

---

## 7. Binding / Host / Runtime Adapter

### 7.1 `binding` namespace

外部runtime/resourceとの接続はflatな`createXXX` / `bindXXX` APIを増殖させず、`binding` namespaceへ集約する。

```ts
binding.invocation({ application, environment, arguments })
binding.host({ application, environment, arguments })
binding.queue(queue, driver)
```

`binding.invocation()`はcallback / transport binding向けで、protocol executionとInvocation Applicationを返す。

```text
InvocationBinding
├ application
├ http?         # HTTP capabilityがある場合
└ messagePort?  # MessagePort capabilityがある場合
```

Invocation Applicationのbase APIは次。

```text
graph
init()
close(signal?)
```

public Taskがあれば`run(task, ...args)`を追加する。
`triggers`はInvocation Applicationへ公開しない。

`binding.host()`はInvocation ApplicationにTrigger Engineを追加できるHost bindingである。
Protocol executionはApplication objectへ埋め込まずbinding側に保持する。

### 7.2 `bootstrap()`

`bootstrap()`はruntime-neutralなHost primitiveで、内部的に`binding.host()`を利用する。

```ts
const app = bootstrap({
  application,
  environment,
  arguments,
})
```

`bootstrap()`が返すHosted Applicationのbase APIは次。

```text
graph
init()
close(signal?)
```

Definitionに応じて型surfaceを増減させる。

```text
public Taskあり → run(task, ...args)
HTTPあり        → fetch(request)
Triggerあり     → triggers.start() / triggers.stop()
```

`bootstrap()`はHTTP listenerを所有しないため`listen()`を持たない。
HTTPをself-hostする場合はruntime adapterを使う。

### 7.3 Runtime Adapter

現行adapter surfaceは次。

| Runtime            | Public API                        | 主な役割                                 |
| ------------------ | --------------------------------- | ---------------------------------------- |
| Node.js            | `nodeRuntime.serve()`             | Node HTTP server ownership               |
| Bun                | `bunRuntime.serve()`              | `Bun.serve()` ownership                  |
| Deno               | `denoRuntime.bind()` / `serve()`  | fetch binding / `Deno.serve()` ownership |
| Cloudflare Workers | `cloudflareWorkersRuntime.bind()` | Worker `fetch` binding                   |
| AWS Lambda         | `awsLambdaRuntime.bind()`         | buffered / streaming HTTP handler        |
| Electron           | `electronRuntime.attach()`        | MessagePort attachment                   |

Node / Bun / Denoの`serve()`はHTTP-capable Applicationだけを受け付ける。
Applicationをinitializeし、TriggerがあればTrigger Engineも起動してからlistenerを開始する。
返却Handleの`close()`はlistener停止とApplication shutdownをまとめて行う。

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const server = await nodeRuntime.serve({
  application,
  port: 3000,
})

await server.close('shutdown')
```

Cloudflare Workers / AWS Lambda等のcallback runtimeはruntime-specific handlerをexportするため、Application sourceではなくHost entry側でbindingする。

---

## 8. Runtime Initialization / Lifecycle / Shutdown

### 8.1 Creation と initialization

Graph inspectionはDefinitionをcompileするだけでruntime initializationを要求しない。
BindingがApplicationRuntime shellを所有し、`init()`または最初のexecutionでruntimeを完成させる。

概念的な順序は次。

```text
Application Definition evaluation
        ↓
Application Graph compile / Graph Probe
        ↓
ApplicationRuntime shell
        ↓
raw Environment / Arguments source binding
        ↓
Standard Schema validation / transform
        ↓
Implementation factory preparation
Layer factory preparation
Task factory preparation
Provider resolution
        ↓
Provider / Module Lifecycle initialization
        ↓
Application ready
```

`init()`はidempotent。
Task / protocol execution / Trigger startは必要ならruntime initializationを開始する。

### 8.2 Lifecycle participant

Lifecycle participantとなるのはapplication-scoped normal Provider instanceとModule lifecycle hookである。
transient Providerはlifecycle保証を持たない。
Environment / Arguments Provider、Implementation runtime、Layer runtime、Task runtimeをProvider lifecycle participantとして自動登録しない。

Provider classは次のmethod-based hookを実装できる。

```text
onModuleInit
onApplicationBootstrap
onModuleDestroy
beforeApplicationShutdown
onApplicationShutdown
```

Module-level lifecycleはdependencyを明示するhook descriptorで表す。

### 8.3 Execution gate

ApplicationRuntimeはactive executionを追跡する。

```text
CREATED
  ↓
INITIALIZING
  ↓
RUNNING
  ├ Protocol execution
  ├ public Task execution
  └ Trigger → Task execution
  ↓ close()/shutdown()
STOPPING
  ├ reject new execution
  └ wait active executions
  ↓
Lifecycle cleanup
  ↓
STOPPED
```

shutdown開始後の新規executionは拒否する。
Application-scoped Providerをactive execution中に破棄しない。
`close()` / runtime shutdownはidempotent。

Trigger Engineの二重開始は`LUTRE_TRIGGERS_ALREADY_STARTED`で拒否する。
初期化途中で失敗した場合は開始済みapplication-scoped Provider / Moduleをreverse orderでcleanupする。
Cleanupも失敗した場合は`AggregateError`へ集約する。

---

## 9. Application Graph / Graph Probe

### 9.1 Application Graph

public `@loutrejs/loutre/graph`が公開・生成する`ApplicationGraphIR`はLoutre本体のPublic APIとして管理する。
Graphだけに独立したschema versionは持たせず、Graph shapeの破壊的変更はLoutre本体のversioningで扱う。

`ApplicationGraphIR`は少なくとも次を持つ。

```text
modules
arguments?
providers
tokens
contextKeys
contracts
pipelines
implementations
tasks
queues
executions
capabilities
hostCapabilities
nodes
edges
diagnostics
```

`TaskIR`は`public: boolean`を持ち、`Application.tasks`由来のpublic TaskとTrigger-only Taskを区別する。

Execution Rootは次。

```text
ProtocolExecutionRootIR
TaskExecutionRootIR
TriggerExecutionRootIR
  ├ CronTriggerExecutionRootIR
  ├ FixedDelayTriggerExecutionRootIR
  └ QueueConsumerTriggerExecutionRootIR
```

Queueは`QueueIR`として別resourceに載る。
TaskはDI rootなので`DependencyNodeIR.kind = 'task'`としてGraph Probe対象になる。
Argumentsも`DependencyNodeIR.kind = 'arguments'`として表現する。

### 9.2 Declared Graph + Graph Probe

Graphはstatic descriptor情報とProbeの両方から作る。

```text
Application entry evaluation
        ↓
Descriptor traversal
        ↓
Declared Graph
        ↓
Graph Probe Container
        ↓
managed class / Layer / Implementation / Taskを
Lifecycleなしで同期construction
        ↓
inject() edge record
        ↓
ApplicationGraph + diagnostics
```

Provider Factoryの`inject`、Lifecycle Hookのdependency、conditional mapping等はdeclared edgeとして収集する。
Class / Layer / Implementation / Taskのdefault parameter `inject()`はProbeで実際にconstructor / factoryを呼び、probed edgeとして収集する。

Dependency conditionはEnvironmentだけでなくArgumentsも表現できる。

```ts
condition?: {
  source: 'environment' | 'arguments'
  contract: string
  key: string
  equals: PropertyKey
}
```

### 9.3 Environment Probe Boundary

Graph生成にdeployment secretを要求しない。
Probe用Environment / Argumentsのruntime-dependent concrete valueへ到達した場合はopaque Probe Boundaryでconstructionを止める。
これはuser-facing diagnostic failureではない。

Nested dependencyがBoundaryへ到達した場合はopaque placeholderを親へ返し、親constructorの後続default parameterを継続してprobeする。
Graph Probeは任意JavaScriptのsymbolic interpreterではないため、dependency topologyをimperative runtime branchへ隠さない。

> **値の正当性はSchema。Dependency topologyはGraph。**

### 9.4 Partial graph

unresolved dependencyやcycle等があっても、取得済みnode / edgeとdiagnosticsを持つpartial graphを返せることを重視する。
CLIの`graph` / `check` / `explain` / `doctor`は同じGraph compile結果を利用する。

---

## 10. Pipeline / Layer / Context

### 10.1 Layer

Layerは **static metadata + synchronous factory** を持つcallable descriptorである。

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

static metadataはfactoryを実行せず解析できる。
Layer factoryはruntime functionを返す同期factoryで、runtime function自体はasyncでよい。

### 10.2 Recursive Pipeline

Pipeline itemはLayer occurrence / Validation / Terminalで構成する。

```text
Pipeline
├ Layer
├ Layer(child Pipeline)
│  ├ Layer
│  └ Layer(child Pipeline)
└ Terminal
```

```ts
pipeline: [transaction([auth, http.controller])]
```

`transaction([...])`は別種類のLayerを作らず、同じLayer definitionとchild pipelineを関連付ける。
呼び出し時にfactoryを実行しない。

Runtimeは同じLayer descriptorのruntime functionをcacheする。
Graph Probeでは別途factoryを実行し得る。

### 10.3 Context / next / short circuit

`requires`はLayerが読むContext Key、`provides`は`next(provided)`で後段へ追加するContext Keyを宣言する。
Runtimeはundeclared property、required provided property不足、Context Key重複、既存Contextの暗黙上書きを拒否する。

child pipelineで追加されたContext / validation stateはchild終了後も親pipeline後段へ伝播する。
Nested Pipelineはlexical Context scopeではない。

正常なLayer終了は原則として次のどちらか。

```text
next() exactly once
OR
shortCircuit(...)
```

Runtimeはnextのskip / reentry、next後のshortCircuitを拒否する。
Downstream errorをLayerがcatchして握り潰してもPipeline runtimeは保持した元errorを再throwする。

Logical terminalはrecursive depth-first順で全体にexactly one、かつ最後でなければならない。

---

## 11. HTTP Architecture

### 11.1 Path / params

v0.x HTTP path grammarはsegment-based。

```text
/
/users
/users/{id}
/users/{userId}/posts/{postId}
```

Param nameは`[A-Za-z_][A-Za-z0-9_]*`。
Paramはsegment全体を占有する。
optional / wildcard / inline regex / inline param / trailing slash alias / query / fragment / duplicate param nameはサポートしない。

Runtime routerはparsed segment matcherを使う。

Path paramはvalidation前からraw `string`として型付き。
`request.params`はobject schemaではなくpropertyごとのStandard Schema mapで宣言する。

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

schema mapのkey集合はpath paramsと完全一致する必要がある。
`validate.params`をPipelineへ置いた地点がrefinement boundaryになる。
`request.params`を書いただけでは自動validationしない。

### 11.2 Dispatch identity

HTTP dispatch keyはmethod + normalized pathである。
Param名やschema内容はroute identityへ影響しない。

```text
GET /users/{id}
GET /users/{userId}
        ↓
http:GET:/users/{}
```

Route dispatchはregistration orderへ依存しない。
Path specificityは左から`static > param`で比較する。

### 11.3 Decode / validation / finalization

HTTP protocol executionはWeb Standard `Request` / `Response`をprotocol boundaryとして使う。

request decodeはpath params、query、headers、JSON、text、FormData、ReadableStreamを扱う。
ValidationはPipeline上の`validate.*` Layerが実行する。
decode failure / validation failureは400へfinalizeする。

Implementationはtransport `Response`を直接構築せずLogical Resultを返す。
Protocol Finalizationがresponse schema validation、headers、serialization、streamingを担当する。
Server streamは`AsyncIterable`を使い、request abort時にiterator cleanupを行う。

### 11.4 CORS / Auth

CORSはHTTP packageのframework Layerとして宣言する。
preflightはController実行前にHTTP boundaryで処理し、actual responseだけでなくvalidation error等のfinalizationにもCORS headersを適用する。

Basic AuthもLayerとして提供し、認証結果はtyped Contextへ追加する。

---

## 12. MessagePort Architecture

MessagePortもHTTPと同じImplementation / Pipeline / Layer / ApplicationRuntimeを使う。
独立した`MessagePortApplication`は持たない。

`messagePort.handler`はPipeline terminalである。
現行MessagePort Protocolの`dispatchKey`は`null`で、procedure名でrouteを選択する。

ResponseはLogical MessagePort ResultとしてImplementationから返し、finalization時にdeclared response schemaでvalidationする。
Server streamは`AsyncIterable`を利用する。

Electron runtime adapterはMessagePort protocol executionをElectron MessagePortへattachする。

---

## 13. CLI / Build / OpenAPI

### 13.1 CLI ownership

Loutre CLIはApplicationを起動するHostではなく、Graph inspection / build / OpenAPI generationを担うdeveloper toolingである。
Application Moduleをfilesystem conventionで探索せず、entry fileを明示する。

現行commandは次。

```sh
loutre check --entry src/app.ts
loutre doctor node --entry src/app.ts
loutre graph modules --entry src/app.ts
loutre graph di --entry src/app.ts --format mermaid
loutre graph contracts --entry src/app.ts
loutre graph executions --entry src/app.ts
loutre graph runtime --entry src/app.ts
loutre explain UsersService --entry src/app.ts
loutre build src/app.ts
loutre openapi --entry src/app.ts
```

`loutre run` / `loutre dev` / `loutre start`は提供しない。
Applicationの実行方法、argv parsing、listener ownershipはHostが所有する。

CLI host wrapperはNode.js / Bun / Denoを判定してargs / cwd / stdout / stderrを抽象化する。
repository内でDenoからsource fallbackは行わず、未build時は事前buildを要求する。

### 13.2 Build

`build`はesbuildでESM Application bundleを生成する。

```sh
loutre build src/app.ts --out-dir dist/loutre
```

deployment runtimeを指定できるのは現行`aws-lambda | cloudflare-workers | deno`。

```sh
loutre build src/app.ts --runtime aws-lambda
loutre build src/app.ts --runtime cloudflare-workers
loutre build src/app.ts --runtime deno
```

指定時は`entry.mjs`も生成し、runtime-specific bindingをHost entryへ閉じ込める。
HTTP-capable Applicationでない場合はdeployment entry生成を拒否する。

### 13.3 OpenAPI

`@loutrejs/loutre/openapi`はApplication DefinitionからOpenAPI 3.2 documentを生成する。
CLIではstdoutまたはJSON fileへ出力できる。

```sh
loutre openapi \
  --entry src/app.ts \
  --output openapi.json \
  --title 'Example API' \
  --api-version 1.0.0
```

Graph command / check / OpenAPI generationはApplication Definitionをloadするが、ApplicationRuntime initializationを要求しない。

---

## 14. Runtime Portability / Capability

Runtime固有機能はCapabilityとしてGraphとHost / Runtime Adapterの境界で照合する。

Capability IRはApplication全体requirementと特定execution requirementを区別する。
Environment Contractを1つ以上宣言したModuleは`env.runtime` capabilityを自動要求する。

Application GraphはApplication側requirementsに加えて`hostCapabilities`も保持する。
CLI `doctor`はGraphからrequired capabilityを抽出し、選択runtimeのcapability setと照合する。

Node capability metadataは`@loutrejs/loutre/runtime`側にも置く。
CLIが`@loutrejs/node`をimportするとBun / DenoでもNode.js専用built-in moduleを評価してしまうため、metadataと実Node adapterを分離する。

現行conformance対象は次。

- Node.js
- Deno
- Bun
- Cloudflare Workers
- Electron
- AWS Lambda

Application Definitionへruntime package名やHost APIを漏らさない。

---

## 15. Testing Contract

architecture変更時は、少なくとも次をpublic type tests / unit tests / runtime conformanceで維持する。

- class/custom tokenの同期`inject()`
- constructor default parameterによるunit-test override
- Injection Contextのnested / exception restoration
- application / transient scope
- Provider factory explicit dependency metadata
- Environment / Arguments Providerとconditional selection
- async Provider / Layer / Implementation / Task factory拒否
- side-effect-free `ApplicationDefinition`
- public Taskがある場合だけ`run()`を公開すること
- Trigger-only Taskをpublic `run()`へ公開しないこと
- HTTPがある`bootstrap()`だけ`fetch()`を公開すること
- listener ownershipをApplicationへ生やさないこと
- TriggerがあるHostだけ`triggers`を公開すること
- Invocation Applicationへ`triggers`を公開しないこと
- required Argumentsのbootstrap時型制約
- Task factory contextual typing / application-lifetime cache
- Task DI Probe dependency recording
- cron / fixed-delay / queue-consumer semanticsと型制約
- Graph IR v5 / TaskIR / ExecutionRootIR / QueueIR
- hostCapabilities
- execution gate / active execution drain / close idempotency
- Implementation / Layer runtime cache
- recursive Pipeline / Context requires / provides
- next exactly-once / short circuit semantics
- conditional全candidate Graph topology
- Environment opaque Probe Boundary
- Environment / Arguments schema validation / transform
- lifecycle非実行のGraph Probe
- initialization rollback / shutdown cleanup
- HTTP path grammar / params refinement / route specificity
- CORS preflight / actual response / error response semantics
- dispatchKey uniqueness
- logical response finalization / streaming abort
- partial Graph diagnostics
- graph text / json / mermaid
- check / explain / doctorのGraph共有
- build deployment entry生成
- OpenAPI 3.2 generation
- Node / Bun / Deno native CLI conformance
- 全runtime conformance

---

## 16. Freeze

Loutre v0.x architectureを短くまとめると次。

> **Applicationは一種類のportable Definition。Protocol / Task / TriggerがExecution RootとしてGraphに載る。**

> **Application GraphがType System / Runtime / Toolingをつなぐ。Compilerは中心ではない。**

> **ContractとProtocolはstatic descriptor、Implementation / Layer / Taskはstatic descriptor + synchronous factory。**

> **DI dependencyは明示し、execution dataはtyped Contextへ置く。**

> **ModuleはEnvironment Contract、ApplicationはArguments Contractを宣言し、Host / Runtime Adapterがraw sourceを供給する。**

> **Standard Schemaがraw valueをApplication valueへ変換する。**

> **Graph Probeはdeployment secretなしでdependencyを収集し、runtime-dependent valueへ到達したらopaque boundaryとして止める。**

> **public Taskだけが`run()` surfaceへ載り、Trigger-only Taskは自動execution専用に保つ。**

> **generic Hostはlistenerを所有しない。Node / Bun / Deno / Cloudflare Workers / AWS Lambda / Electron adapterがHost固有APIを担当する。**

> **Loutre CLIはGraph / build / OpenAPI toolingであり、Applicationのrun / dev / startを所有しない。**
