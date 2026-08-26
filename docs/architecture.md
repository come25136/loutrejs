# Loutre Architecture

- 状態: **実装済み基準 / source of truth**
- 対象: Loutre v0.1
- 更新日: 2026-08-26 JST

## 0. Source of Truth

この文書を Loutre v0.1 の architecture 上の source of truth とする。

過去の `docs/*.md` には設計検討、Codex向け実装指示、migration時点の判断が含まれるため、現在の実装と矛盾する場合がある。

判断の優先順位は次とする。

```text
現行 develop の実コード / type tests / runtime conformance
        ↓
architecture.md
        ↓
個別の design / amendment / handoff docs
```

個別docsは設計経緯の記録として残してよいが、現在のarchitectureを上書きしない。

---

## 1. Architecture Principle

Loutre は、明示的な **Application Graph** を中心に Contract、Protocol、Implementation、Pipeline、DI、Environment、Lifecycle、Runtime Capability を統一的に扱う TypeScript Application Framework である。

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
                                └ doctor
```

設計原則は次とする。

> **Graph-first, type-safe runtime.**

> **Framework-managed dependency は明示する。Execution data は typed context で渡す。**

> **Application code は runtime-specific Environment API を知らない。**

> **同期的に完成できる object invariant を framework 都合で `undefined` に落とさない。**

> **Graph Probe が Application の自然な constructor / factory 設計を歪めてはならない。**

TypeScript Source Compiler、Runtime Linkage Artifact、decorator metadata は Application Graph の成立条件ではない。

---

## 2. Package Boundary

現行 package boundary は概ね次のとおり。

```text
@loutrejs/core
├ Contract / Procedure / Protocol descriptor
├ Module / Provider / Token
├ Environment Contract / defineEnv()
├ Implementation descriptor / synchronous factory
├ inject() / Injection Context
├ Pipeline / Layer / Context Key
└ Lifecycle descriptor

@loutrejs/graph
├ ApplicationGraphIR
├ descriptor traversal
├ Graph Probe / Dependency Recorder
├ semantic validation
├ Environment / Capability topology
└ graph serialization source

@loutrejs/runtime
├ synchronous DI Container
├ runtime Environment binding
├ application / transient scope
├ Implementation / Layer runtime preparation
├ Lifecycle execution
└ Pipeline execution

@loutrejs/http
├ HTTP Protocol descriptor
├ HTTP path grammar / routing
├ request decode / validation
├ response finalization
└ HTTP Application

@loutrejs/message-port
├ MessagePort Protocol descriptor
├ message invocation / finalization
└ MessagePort Application

@loutrejs/runtime-node
@loutrejs/runtime-deno
@loutrejs/runtime-bun
@loutrejs/runtime-workerd
@loutrejs/runtime-electron
@loutrejs/runtime-lambda
└ runtime-specific adapter / Environment source / Capability

@loutrejs/cli
├ graph / check / explain / doctor
├ build
└ dev / start
```

`@loutrejs/compiler` packageは存在しない。

Core / Graph / Runtime の成立に TypeScript compiler API、`emitDecoratorMetadata`、`reflect-metadata`、Node.js固有 DI primitive を要求しない。

---

## 3. Contract / Protocol / Implementation

### 3.1 Contract と Protocol

`Contract` は Procedure の集合であり、各 Procedure が Protocol descriptor を持つ。

`ProtocolDescriptor` は正式概念として `dispatchKey: string | null` を持つ。

```ts
interface ProtocolDescriptor<
  TName extends string,
  TContext,
  TResult,
  TDispatchKey extends string | null,
> {
  readonly kind: 'protocol'
  readonly protocol: TName
  readonly interaction?: InteractionMode
  readonly dispatchKey: TDispatchKey
}
```

Protocol固有の dispatch identity は Protocol package が生成する。
Core / Graph はその文字列の内部grammarを解釈しない。

同一 Contract 内の非null `dispatchKey` 重複は、型レベル制約と `contract()` runtime validation の両方で拒否する。
Application 全体の重複は Graph compile が `LUTRE_PROTOCOL_001` として検出する。

### 3.2 Implementation は class ではない

Contract Implementation の canonical model は **static descriptor + synchronous factory** である。

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

`Controller` / `Handler` は Application 上の呼称や変数名として使ってよいが、Coreの別component typeではない。

Implementation descriptor は少なくとも次を持つ。

```text
kind = implementation
name
contract
protocol       // canonical protocol name string
procedures     // definition時にnormalize済み
factory
```

`procedures` を省略した場合、指定 Protocol を持つ Contract procedures 全体へ definition 時にnormalizeする。
Partial Implementation の場合も選択procedureはdescriptorへ固定する。

Implementation factory resultは、選択procedureをcallable propertyとして持つnon-null objectでなければならない。
Factory自体がthenableを返すことは禁止する。
Procedure functionがasyncなのは合法。

### 3.3 Implementation の lifetime

Implementation runtime object は実際の `ApplicationRuntime` ごとに1つ構築してcacheし、request/messageごとに再生成しない。

ただし同じfactoryは、

```text
Graph Probe
Runtime initialization
```

で別々に実行され得る。

Implementation descriptor / runtime object は DI token ではない。
`inject(UsersController)` のような暗黙DI対象にはしない。

Implementation runtime objectはProvider Lifecycle participantにも自動登録しない。
Lifecycleを必要とする共有resourceはProviderへ分離する。

---

## 4. Module / Provider

### 4.1 Module

現行 `ModuleDefinition` は概念的に次を持つ。

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

Moduleの `name` は開発・Graph表示用metadataであり、未指定でもruntime correctnessへ影響しない。
Graphではstableな内部 module ID へfallbackする。

ModuleはImplementation descriptorだけを知ればよく、ContractとImplementationの関係を別の `implement(...).for(...).with(...)` APIで再宣言しない。

### 4.2 Provider

Provider の canonical kinds は次。

```text
class
value
factory
conditional
environment   // framework-managed
```

Scope は `application | transient`。

classを `providers: [Service]` と直接置く場合は `provide(Service).useClass(Service)` 相当のapplication-scoped providerへnormalizeする。

Value Providerはapplication scope。

Factory Providerは現在、dependencyを明示metadataで宣言する。

```ts
provide(CACHE).useFactory({
  inject: [Config],
  use: (config) => new Cache(config),
})
```

Class Provider / class constructor は `inject()` default parameterを使うが、Provider `useFactory` は `inject: [...]` をsource of truthとする。

Conditional Providerは `EnvKey` とcandidate class mappingを持つ。

```ts
provide(STORAGE).select(AppEnv.key('storageDriver'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
```

Graphは現在選択されていないcandidateも含めてtopologyを保持する。

---

## 5. Dependency Injection

### 5.1 `inject()`

class tokenとcustom tokenは同じ `inject()` で解決する。

```ts
const DATABASE = token<Database>('database')

class UserRepository {
  constructor(readonly database = inject(DATABASE)) {}
}

class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

class dependency の canonical form は constructor default parameter。

```ts
const service = new UsersService(mockRepository)
```

のようにunit testで明示argumentを渡せばdefault initializerは評価されず、Test Containerを要求しない。

`@Injectable()`、class dependency用 `@Inject()`、`experimentalDecorators`、`emitDecoratorMetadata`、`reflect-metadata` は要求しない。

### 5.2 Injection Context

`inject()` は Service Locator APIではない。

```text
inject(token)
    ├ dependency declaration
    ├ synchronous dependency resolution
    └ consumer → dependency edge recording
```

framework-managedな同期construction中だけ利用可能。

- Provider class constructor
- Layer factory
- Implementation factory

procedure bodyや通常のApplication処理からの `inject()` は `LUTRE_DI_CONTEXT` で失敗する。

Injection Contextは同期stack + `try/finally` で復元し、DIのために `AsyncLocalStorage` を使用しない。

### 5.3 Execution data は DI ではない

次はDIへ入れない。

- request
- session
- current user
- current tenant
- permissions
- request/message固有state

これらは typed `ctx` / Context Key / Pipeline に置く。

### 5.4 Managed class と constructor

Containerは未宣言classを暗黙auto-resolveしない。

framework-managed classにrequired constructor parameterを置かず、dependencyはdefault parameterとして表す。

```ts
class Service {
  constructor(readonly repository = inject(Repository)) {}
}
```

DI cycleは `LUTRE_DI_CYCLE`、未解決dependencyは `LUTRE_DI_UNRESOLVED`。

### 5.5 Construction は同期

Container resolution、class constructor、Provider factory、Layer factory、Implementation factory は同期である。

Factoryがthenableを返す場合はfail-fastする。

ただし、**同期construction = dependency wiringだけ** と狭く定義しない。

同期的に完成できるobject invariantはconstructor / factoryで完成させてよい。
Framework都合でrequired fieldを `T | undefined` へ落としてLifecycleまで待たせてはならない。

```ts
class PostgresDatabase implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool

  constructor(readonly env = inject(AppEnv)) {
    this.pool = new Pool({
      connectionString: env.databaseUrl.href,
    })
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1')
  }

  async onModuleDestroy() {
    await this.pool.end()
  }
}
```

一方、Graph Probeでもconstructor/factoryが実行されるため、次はconstructionで行わない。

- network / DB query等のI/O
- listener / watcher start
- long-running timer start
- process-wide mutable side effect
- business operation

ローカルな同期resource wrapper / client object生成は、そのconstructor自体が外部I/Oを開始しない限り許容する。
Graph Probeを一般的なside-effect sandboxとして当てにしてはならない。

---

## 6. Runtime Environment

### 6.1 Environment Contract

Environmentは `process.env` wrapperではなく、**Raw Runtime Environment → Application Environment** の変換Contractである。

```text
Raw Runtime Environment
        ↓
  Standard Schema
  ┌──────────────┐
  │ parse        │
  │ coerce       │
  │ validate     │
  │ cross-field  │
  │ transform    │
  │ derive       │
  └──────────────┘
        ↓
Application Environment
        ↓
     AppEnv
        ↓
   inject(AppEnv)
```

Loutre独自のEnvironment validation / transform DSLは持たない。
Standard Schema implementationをそのまま利用する。

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

`defineEnv()` のschema outputはobjectでなければならない。
InputとOutputは同一である必要がない。

`AppEnv.key()` はraw keyではなく **transform後output key** を参照する。

```ts
AppEnv.key('storageDriver')
```

### 6.2 Module declaration

ApplicationはEnvironment sourceそのものではなく、必要なContractをModuleへ宣言する。

```ts
const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [Database],
}))
```

`defineModule()` は `Module.environment` からframework-managed `environment` Providerを合成する。
同じEnvClassはdedupeする。

runtime-managed Envと通常Providerを同じtokenへ二重宣言してはならない。

### 6.3 Runtime Adapter がraw sourceを供給する

Application codeで通常、次を直接読まない。

```text
process.env
Bun.env
Deno.env
workerd fetch env bindings
```

Runtime Adapterが初期化境界でraw sourceを渡す。

現行実装では概ね次。

```text
Node      → process.env
Bun       → Bun.env
Deno      → Deno.env.toObject()
workerd   → fetch(request, env) の env
Lambda    → process.env
Electron  → main process の process.env
CLI       → process.env
```

Test / embeddingではruntime optionやadapter optionからEnvironment sourceをoverrideできる。

`loadEnv()` は低レベル・testing用途として存在するが、通常Applicationが `loadEnv(process.env)` → `provide(AppEnv).useValue(...)` を手書きするモデルではない。

### 6.4 Environment diagnostics

現行architecture上重要なEnvironment errorは次。

- `LUTRE_ENV_001`: runtime-managed Envとnormal Providerの競合
- `LUTRE_ENV_002`: Envをinjectしたが `Module.environment` に宣言されていない
- `LUTRE_ENV_003`: Runtime binding時のschema validation failure
- `LUTRE_ENV_005`: Environment ContractがあるのにRuntime sourceが供給されない
- `LUTRE_ENV_006`: resolve済みEnvironmentのrebindを拒否

**`LUTRE_ENV_004` は存在しない。**
Graph Probe中のEnvironment concrete value accessはuser-facing diagnosticではなく、内部Probe Boundaryである。

Schema validation failureのframework messageにraw secret valueを含めない。

---

## 7. Application Runtime / Initialization / Lifecycle

### 7.1 Application creation と runtime initialization は別phase

`createHttpApplication()` / `createMessagePortApplication()` の時点でApplication Graphはcompileするが、実runtimeのImplementation / Layer factoryやLifecycleを完成させない。

`ApplicationRuntime` は初期状態でmodule graphとContainer shellを持ち、`initialize()` でruntimeを完成させる。

現行順序は概念的に次。

```text
Application definition evaluation
        ↓
Application Graph compile / Graph Probe
        ↓
ApplicationRuntime shell
        ↓
Runtime Adapter supplies raw Environment
        ↓
Environment validation / transform / binding
        ↓
Implementation factory preparation
Layer factory preparation
Provider resolution
        ↓
Provider / Module Lifecycle initialization
        ↓
Application ready
```

重要:

> **実runtimeのconstructor / factoryがEnvironmentを読む時点では、validated AppEnvがbind済み。**

Environment validationはasyncになり得るため、PromiseはLifecycle / protocol executionだけでなくRuntime initializationにも利用する。

### 7.2 Lifecycle participant

Lifecycle participantとなるのはapplication-scoped normal Provider instanceとModule lifecycle hook。

transient Providerはlifecycle保証を持たない。
Environment Provider、Implementation runtime、Layer runtimeをProvider lifecycle participantとして自動登録しない。

Provider classはmethod-based hooksを実装できる。

```text
onModuleInit
onApplicationBootstrap
onModuleDestroy
beforeApplicationShutdown
onApplicationShutdown
```

Module-level lifecycleは `hook({ inject, run })` でdependencyを明示する。

### 7.3 Constructor と Lifecycle の責務

```text
constructor / synchronous factory
    ↓
同期的なobject invariantを完成

onModuleInit / module hook
    ↓
async startup / connect / readiness / verification

shutdown hooks
    ↓
cleanup
```

「resourceらしいものはすべてconstructor禁止」というルールは採用しない。

外部I/Oが必要ならLifecycleへ置く。
同期的に生成できるclient/pool wrapperまでframework都合で `undefined` にする必要はない。

### 7.4 Failure semantics

初期化途中で失敗した場合は、開始済みapplication-scoped Provider / Moduleをreverse orderでcleanupする。
Cleanupも失敗した場合は初期化errorを先頭に含む `AggregateError` を返す。

通常shutdownでもcleanupはbest-effortで継続し、複数失敗を `AggregateError` として集約する。
停止済みApplicationは再初期化しない。

---

## 8. Application Graph / Graph Probe

### 8.1 Graph IR

Application Graph IRは `version: 2`。

少なくとも次を持つ。

- Modules
- Module Environment declarations
- Providers
- Tokens / Context Keys
- Contracts / Procedures / Protocols
- Pipelines
- Implementations
- Runtime capabilities
- DI dependency nodes / edges
- diagnostics

Environmentは `kind: 'environment'` のProvider / dependency nodeとしてGraphへ表現するが、Environment concrete value / secretはGraph IRへ含めない。

DI edgeはfirst-class IR。

```ts
interface DependencyEdgeIR {
  readonly from: string
  readonly to: string
  readonly kind:
    | 'inject'
    | 'factory'
    | 'lifecycle'
    | 'conditional'
    | 'framework'
  readonly source: 'declared' | 'probed'
  readonly condition?: {
    readonly key: string
    readonly equals: PropertyKey
  }
}
```

### 8.2 Declared Graph + Graph Probe

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
managed class / Layer factory / Implementation factoryを
Lifecycleなしで同期construction
        ↓
inject() edge record
        ↓
ApplicationGraph + diagnostics
```

Provider Factoryの `inject`、Lifecycle Hookの `inject`、conditional mapping等はdeclared edgeとして収集する。

Class / Layer / Implementationのdefault parameter `inject()` はProbeで実際にfactory/constructorを呼び、probed edgeとして収集する。

### 8.3 Environment Probe Boundary

Graph生成にdeployment secretを要求しない。

Probe用Environmentはopaque valueである。

```text
probe Database
    ↓
inject(AppEnv)
    ↓
Database → AppEnv edgeをrecord
    ↓
env.databaseUrl を読む
    ↓
internal GraphProbeBoundary
    ↓
runtime-dependent constructionを停止
```

これはdiagnostic failureではない。

Nested dependencyがBoundaryへ到達した場合はopaque placeholderを親へ返す。
そのため親constructorの後続default parameterは継続してprobeできる。

```ts
class Service {
  constructor(
    readonly database = inject(Database),
    readonly logger = inject(Logger),
  ) {}
}
```

`Database` がEnv concrete valueへ到達しても、`Service → Logger` のprobeを継続できる。

Opaque placeholderを具体利用しようとすると再びBoundaryとなり、そのconstructionを停止する。

### 8.4 Graph Probe はsymbolic JavaScript interpreterではない

Graph Probeは任意のruntime branchを完全解析するものではない。

依存topologyをruntime valueのimperative branchに隠さない。

非canonical:

```ts
if (env.storageDriver === 's3') {
  inject(S3Storage)
} else {
  inject(MemoryStorage)
}
```

canonical:

```ts
provide(STORAGE).select(AppEnv.key('storageDriver'), {
  s3: S3Storage,
  memory: MemoryStorage,
})
```

Class / Layer / Implementation dependencyはdefault parameter、Provider factory / Module lifecycle dependencyは明示 `inject` metadataへ置く。

> **値の正当性はSchema。Dependency topologyはGraph。**

### 8.5 Partial graph

unresolved dependencyやcycle等があっても、取得済みnode / edgeとdiagnosticsを持つpartial graphを返せることを重視する。

---

## 9. Pipeline / Layer / Context

### 9.1 Layer は1種類

Layerは **static metadata + synchronous factory** を持つcallable descriptor。

```ts
const auth = layer({
  name: 'auth',
  requires: [SESSION],
  provides: [CURRENT_USER],
  factory: (users = inject(UserService)) =>
    async (ctx, next) => {
      const currentUser = await users.resolve(ctx.session)
      await next({ currentUser })
    },
})
```

static metadataはfactoryを実行せず解析可能。

```text
name
role
requires
provides
requiresValidated
shortCircuits
factory
```

Layer factoryはruntime functionを返す同期factory。
Runtime function自体はasyncでよい。

### 9.2 Recursive Pipeline

Pipeline itemはLayer / Validation / Terminal。

```text
Pipeline
├ Layer
├ Layer(child Pipeline)
│  ├ Layer
│  └ Layer(child Pipeline)
│     └ Layer
└ Terminal
```

Layerを直接置く場合:

```ts
pipeline: [auth, http.controller]
```

child pipelineを持つOccurrenceを作る場合:

```ts
pipeline: [transaction([auth, http.controller])]
```

`transaction([...])` は別種類のLayerを作らず、同じLayer definitionとchild pipelineを関連付けるだけ。
呼び出し時にfactoryを実行しない。

実際のApplicationRuntimeでは同じLayer descriptorのruntime functionをcacheする。
Graph Probeでは別途factoryを実行し得る。

### 9.3 Context

`requires` はLayerが読むことを宣言したContext Key。
Layer runtimeの `ctx` には宣言したContextだけを型として公開する。

`provides` がある場合は `next(provided)` で値を追加する。

Runtimeは少なくとも次を拒否する。

- undeclared property
- required provided property不足
- 同名Context Key重複
- 既存Contextの暗黙上書き

child pipelineで追加されたContext / validation stateは、child終了後も親pipeline後段へ伝播する。
Nested Pipelineはlexical Context scopeではない。

### 9.4 `next()` / short circuit

正常なLayer終了は原則として次のどちらか。

```text
next() exactly once
OR
shortCircuit(...)
```

Runtimeはnextのskip / reentry、next後のshortCircuitを拒否する。

Downstream errorをLayerがcatchして握り潰しても、Pipeline runtimeは保持した元errorを再throwする。

Logical terminalはrecursive depth-first順で全体にexactly one、かつ最後でなければならない。

---

## 10. HTTP Architecture

### 10.1 HTTP path がraw params構造のsource of truth

v0.1 path grammarはsegment-based。

```text
/
/users
/users/{id}
/users/{userId}/posts/{postId}
```

Param name:

```text
[A-Za-z_][A-Za-z0-9_]*
```

Paramはsegment全体を占有する。

現在サポートしない例:

```text
{id?}
{*path}
{id:\d+}
foo-{id}
```

trailing slash alias、query / fragment入りpath、同じparam名の重複も拒否する。

Runtime routerはregex compileではなくparsed segment matcherを使う。

### 10.2 HTTP params

Path paramはvalidation前からraw `string` として型付き。

```ts
path: '/users/{id}'
// ctx.params.id: string
```

`request.params` はobject schemaではなくpropertyごとのStandard Schema map。

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

Schema mapを宣言する場合、key集合はpath paramsと完全一致し、各schemaはraw string入力を受け取れる必要がある。

`validate.params` をPipelineに置いた時点がrefinement boundary。

```text
before validate.params
  id: string

validate.params

after validate.params
  id: SchemaOutput<typeof schema>
```

`request.params` を書いただけでは自動validationしない。
Schemaなしで `validate.params` を置くこともdefinition error。

Params mapはproperty-wise validation / transformの責務だけを持つ。
複数param間のcross-field/domain constraintはLayerやdomain logicへ置く。

### 10.3 HTTP dispatch identity

HTTP dispatch keyは method + normalized path。

```text
GET /users/{id}
GET /users/{userId}
        ↓
http:GET:/users/{}
```

Param名やschema内容はroute identityへ影響しない。

Route dispatchはregistration orderへ依存しない。
Path specificityは左から `static > param` で比較する。

```text
/users/me
```

と

```text
/users/{id}
```

が両方matchする場合、static routeを優先する。

### 10.4 HTTP decode / validation / finalization

HTTP ApplicationはWeb Standard `Request` / `Response` をprotocol boundaryとして使う。

Request decodeは概ね次。

- path params → decoded string record
- query同名複数値 → `string[]`
- headers → record
- `application/json` → JSON
- `text/*` → string
- `multipart/form-data` → FormData
- その他body → ReadableStream

ValidationはPipeline上の `validate.*` Layerが実行する。
Decode failureは400、validation failureも400。

Implementationはtransport `Response` を直接構築するのではなくLogical Resultを返し、Protocol Finalizationがresponse schema validation、headers、serialization、streamingを担当する。

Server streamは `AsyncIterable` を使い、request abort時にiterator cleanupを行う。

---

## 11. MessagePort Architecture

MessagePortもHTTPと同じ `implementation()` / Pipeline / Layer / ApplicationRuntimeを使う。

`messagePort.handler` はPipeline terminalであり、Handler classという別framework componentは存在しない。

現行MessagePort protocolの `dispatchKey` は `null`。
MessagePort Applicationはprocedure名でrouteを選択する。

ResponseはLogical MessagePort ResultとしてImplementationから返し、finalization時にdeclared response schemaでvalidationする。
Server streamは `AsyncIterable` を利用する。

---

## 12. Unified Validation

Contract coverage、Protocol dispatch identity、Pipeline、DI、Module、Environment topology、Runtime capability等のsemantic validationは、可能な限り `@loutrejs/graph` の同じApplication Graphをsource of truthとする。

```text
ApplicationGraph
      │
      ├ application creation
      ├ loutre check
      ├ loutre graph
      ├ loutre explain
      └ loutre doctor
```

Protocol packageはprotocol固有definition validationを持てるが、Application全体のsemanticsをCLI / Runtimeごとに別実装しない。

---

## 13. CLI / Build

CLIはApplication Moduleをfilesystem conventionで探索しない。
Application entryは明示する。

現行syntaxでは、Graph系commandは `--entry` を使う。

```sh
loutre graph di --entry src/app.ts --format text
loutre graph di --entry src/app.ts --format json
loutre graph di --entry src/app.ts --format mermaid
loutre check --entry src/app.ts
loutre explain UsersService --entry src/app.ts
loutre doctor workerd --entry src/app.ts
```

`build` / `dev` / `start` は現行CLIではentryをposition argumentで受け取る。

```sh
loutre build src/app.ts
loutre dev src/app.ts
loutre start dist/application.mjs
```

`build` はSource Compilerによるsource rewriteをしない。
現在はesbuildでESM Application bundleを生成し、ApplicationGraphからGraph Manifestを生成する。

通常bundleはplatform-neutral ES2024を基準とし、CLI内部のGraph/load用途ではNode compatibility modeを利用する場合がある。

Graph command / checkはApplicationをimportしてGraphを取得するが、runtime `initialize()` は要求しない。
したがってdeployment Environment secretなしでGraphを生成できることを維持する。

---

## 14. Runtime Portability / Capability

Runtime固有機能はCapabilityとしてGraphとadapterの間で照合する。

Environment Contractを1つ以上宣言したModuleは `env.runtime` capabilityを自動要求する。
Application側で同じrequirementを手書きしない。

現行conformance対象:

- Node.js
- Deno
- Bun
- workerd
- Electron
- AWS Lambda

Runtime Adapterがhost-specific server / message port / Environment sourceをApplication boundaryへ接続する。
Application coreへhost APIを漏らさない。

DI / Graph ProbeはWeb/ECMAScriptで広く使えるprimitiveを中心に実装する。
PromiseはEnvironment binding、Lifecycle、protocol execution / streamingで利用する。

---

## 15. Testing Contract

architecture変更時は、少なくとも次をtype tests / unit tests / conformanceで維持する。

- class/custom tokenの同期 `inject()`
- constructor default parameterによるunit-test override
- Injection Contextのnested / exception restoration
- application / transient scope
- Provider factory explicit dependency metadata
- async Provider / Layer / Implementation factory拒否
- Implementation factory contextual typing
- Implementation runtime application-lifetime cache
- Layer factory cacheとrecursive child Pipeline
- Context requires / provides
- next exactly-once / short circuit semantics
- conditional全candidate Graph topology
- Graph Probe dependency recording
- Environment opaque Probe Boundary
- Probe Boundary後の親constructor後続dependency収集
- Environment schema parse / cross-field validation / transform
- transformed `AppEnv.key()`
- undeclared Env / provider conflict diagnostics
- Environment binding後のruntime construction
- lifecycle非実行のGraph Probe
- initialization rollback / shutdown cleanup
- HTTP path grammar / params refinement / route specificity
- dispatchKey uniqueness
- logical response finalization / streaming abort
- partial Graph diagnostics
- graph text / json / mermaid
- check / explain / doctorのGraph共有
- compiler / runtime linkageなしのbuild / dev / start
- 全runtime conformance

---

## 16. Removed / Non-Canonical Concepts

次をv0.1 canonical architectureへ戻さない。

```text
TypeScript Source Compiler as runtime requirement
Runtime Linkage Artifact
emitDecoratorMetadata based DI
@Injectable / @Inject requirement
implicit class auto-resolution
class-only Controller / Handler model
implement(Contract).for(protocol).with(Class)
ImplementationBinding
Layer inbound / outbound / state
CompositeLayerDescriptor
layer.compose()
Framework-owned DatabaseService abstraction
ExecutionScope as framework transaction primitive
HTTP regex-based route identity
schema-driven route dispatch
registration-order-dependent HTTP routing
z.object() as HTTP path params structure declaration
Application-level direct process.env as canonical Environment wiring
Graph generation requiring deployment secrets
LUTRE_ENV_004 concrete-env-read diagnostic
constructor resource field forced to T | undefined for framework lifecycle reasons
```

Database、Transaction、Prisma、Drizzle、AsyncLocalStorage等はCore専用概念にしない。
必要なApplication primitiveはProvider / Lifecycle / Layer / Contextで表現する。

---

## 17. Freeze

Loutre v0.1 architectureを短くまとめると次。

> **Application Graphが中心。Compilerは中心ではない。**

> **ContractとProtocolはstatic descriptor、ImplementationとLayerはstatic descriptor + synchronous factory。**

> **DI dependencyは明示し、execution dataはtyped Contextへ置く。**

> **ModuleはEnvironment Contractを宣言し、Runtime Adapterがraw Environment sourceを供給する。**

> **Standard Schemaがraw valueをApplication valueへ変換する。**

> **constructor / factoryは同期的なobject invariantを完成させてよい。I/O lifecycleはLifecycleへ置く。**

> **Graph Probeはsecretなしでdependencyを収集し、runtime-dependent valueへ到達したらopaque Probe Boundaryとして安全に止める。**

> **Protocol固有identityはProtocol packageが決め、Graphはprotocol-neutralに検証する。**

> **Runtime Adapterだけがhost-specific APIを知る。Application codeはportableに保つ。**

過去の個別設計資料は詳細な経緯として参照できるが、本書または現行実装と矛盾する記述はhistoricalとみなす。
