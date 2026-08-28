# ADR: Loutre Application Inputs / Task / Host Boundary Architecture

- 状態: **ACCEPTED / DESIGN FROZEN**
- 対象: Loutre v0.1 breaking change
- Base: `develop`
- 日付: 2026-08-27 JST
- 方針: **後方互換性より責務境界・Graph整合性・Host portabilityを優先する**
- Source of Truth: **本ADRを本変更の実装基準とする**
- Supersedes:
  - `docs/adr/loutre_unified_application_execution_architecture.md` の Entrypoint / manual execution / CLI Host に関する設計
  - `docs/adr/loutre_trigger_host_architecture.md` の Entrypoint / CLI `run` / Definition直接Hostに関する設計
- Related:
  - `docs/adr/loutre_runtime_environment_architecture.md`
- 実装担当向け注意:
  - 互換 alias / compatibility layer は原則作らない。
  - `entrypoint()` を残して `task()` を追加する二重APIにはしない。
  - Loutre独自のCLI command / option DSLは作らない。
  - `process.argv` をApplication Runtimeで読まない。
  - `compileApplication()` にruntime executionを持たせない。
  - 本ADRのNon-goalsを勝手に拡張しない。
  - まず型テストを作り、その後runtime / Graph / CLIを変更する。

---

# 0. 結論

Loutreは **Application framework** であり、Application固有の **CLI frameworkではない**。

Applicationは一つのportableな `ApplicationDefinition` として宣言し、Hostが `bootstrap()` を通じてruntime inputsを渡してHosted Applicationへbindする。

Loutreのruntime modelは次の2軸へ整理する。

```text
                         Application
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
       Application Inputs              Execution
              │                             │
       ┌──────┴──────┐          ┌───────────┼───────────┐
       ▼             ▼          ▼           ▼           ▼
 Environment      Arguments   Protocol     Task       Trigger
       │             │          │           ▲           │
       │             │          ▼           │           │
       │             │    Implementation    └───────────┘
       │             │
       └─────────────┴──────── DI
```

Application Inputs:

```text
Environment
  = Runtime / Deployment が所有する外部環境

Arguments
  = Host がそのApplicationをどう起動するか決める入力
```

Execution:

```text
Protocol
  = HTTP / MessagePort 等の外部protocol execution

Task
  = HostまたはTriggerから実行できる型付きApplication operation

Trigger
  = cron / fixed-delay / queue-consumer 等、Taskを自動発火するもの
```

CLI構文はLoutreの責務ではない。

```text
yargs / Commander / clipanion / node:util.parseArgs / 独自Host
                               │
                               ▼
                         structured value
                               │
                               ▼
bootstrap({
  application,
  environment,
  arguments,
})
                               │
                               ▼
                        Hosted Application
                               │
                               ▼
                       app.run(task, input)
```

Canonical API:

```ts
const application = defineApplication({
  modules: [AppModule()],

  arguments: AppArgs,

  tasks: [migrate, rebuildSearchIndex],

  triggers: [nightlyCleanup, orderConsumer],
})

const app = bootstrap({
  application,

  environment: process.env,

  arguments: {
    instance: 'production',
    workers: 8,
  },
})

await app.run(migrate, {
  revision: 'latest',
})
```

Freezeする原則:

> **Loutre defines the application. The host decides how it is invoked.**

> **EnvironmentとArgumentsはApplication-scoped Runtime Inputsである。**

> **Environmentはruntime-owned、Argumentsはhost-ownedである。**

> **Environment ContractはModuleが複数宣言できる。Arguments ContractはApplicationが0..1個だけ所有する。Argumentsはmergeしない。**

> **Entrypoint conceptは廃止し、汎用Application operationをTaskとして表現する。**

> **外部入力validationは外部boundaryが所有する。TaskはCLI/HTTP/Queue固有のvalidation DSLを持たない。**

> **compileApplication()は静的Graph compilerのまま維持し、runtime executionを持たせない。**

---

# 1. 背景

これまでLoutreでは `Entrypoint` が次の複数責務を兼ねていた。

```text
Entrypoint
├ manual Application root
│   └ app.run(...)
│
├ cron target
├ fixed-delay target
└ queue-consumer target
```

さらに `@loutrejs/cli` が、

```text
loutre run
loutre dev
loutre start
```

を通じてApplication Definitionを直接Hostしていた。

この状態からApplication固有CLI引数をfirst-classにしようとすると、Loutre側に次の機能が必要になる。

```text
-h / --help
short aliases
long options
positionals
subcommands
nested subcommands
option conflicts
required combinations
completion
usage rendering
argv scope splitting
```

しかし、これらは既にyargs / Commander / clipanion / Node標準API等が成熟して提供している。

Loutreが同じ抽象を再実装すると、

- CLI parserの再発明
- Application GraphとCLI syntaxの結合
- CLIを使わないLambda / workerd / Electron / testsへの不要な概念流入
- `Command` と `Task` の二重execution model
- Standard SchemaとCLI validation DSLの二重管理

が発生する。

根本原因は、

> CLI引数そのもの

と、

> HostがApplicationへ渡す起動時input

を同一視したことにある。

Loutreが必要としているのはargv parserではない。

必要なのは、

> **Hostから渡されたstructured runtime inputをApplication-scopedな型付き値としてbindできること**

である。

---

# 2. 設計原則

## 2.1 Applicationは一種類

Loutreに存在するApplication conceptは一つ。

以下は作らない。

```text
HttpApplication
WorkerApplication
CliApplication
SchedulerApplication
QueueApplication
```

Application Definitionはportable declarationであり、runtime side effectを持たない。

```ts
const application = defineApplication({
  modules: [AppModule()],
})
```

この時点で以下は存在しない。

```ts
application.init
application.listen
application.fetch
application.run
application.close
```

Hostがbootstrapした後にHosted Applicationとなる。

```text
ApplicationDefinition
        │
        ▼
     bootstrap
        │
        ▼
HostedApplication
```

---

## 2.2 Configuration PlaneとExecution Planeを分離する

Loutre runtimeは次の2種類の値を明確に分離する。

```text
Application-scoped Runtime Inputs
├ Environment
└ Arguments

Execution-scoped Inputs
├ HTTP request/context
├ Task input
└ Queue payload
```

Application-scoped Runtime Inputsはruntime constructionより前にbindされる。

したがってProvider topologyへ影響してよい。

Execution-scoped InputsはApplication runtimeが完成した後に到着する。

したがってProvider topologyへ影響してはならない。

```text
Environment / Arguments
          │
          ├── Provider construction
          ├── conditional Provider selection
          ├── Implementation factory
          ├── Layer factory
          └── Task factory

HTTP / Task input / Queue payload
          │
          └── execution runtime only
```

---

# 3. Environment と Arguments

## 3.1 共通点

EnvironmentとArgumentsはいずれも、

```text
unknown raw source
        ↓
 Standard Schema
        ↓
validated / transformed object
        ↓
framework-managed provider
        ↓
       DI
```

という同じruntime substrateを使う。

Application codeからは、

```ts
inject(AppEnv)
inject(AppArgs)
```

として利用できる。

両者ともProvider / Implementation / Layer / Task factoryより前にvalidationを完了する。

---

## 3.2 Environmentの意味

Environmentは、

> **Applicationが置かれたRuntime / Deployment環境の情報**

である。

例:

```text
DATABASE_URL
REDIS_URL
AWS_REGION
S3_BUCKET
service bindings
workerd bindings
```

Environment ContractはModuleが所有する。

```ts
const DatabaseModule = defineModule(() => ({
  environment: [DatabaseEnv],
  providers: [Database],
}))
```

意味は、

> DatabaseModuleを動かすruntimeにはDatabaseEnvを満たす環境が必要

である。

したがってEnvironment Contractは複数存在してよい。

```text
Application
├ DatabaseModule → DatabaseEnv
├ CacheModule    → CacheEnv
└ StorageModule  → StorageEnv
```

同一EnvClassを複数Moduleが宣言した場合はidentityでdedupeする。

Environmentの詳細仕様は `loutre_runtime_environment_architecture.md` を維持する。

---

## 3.3 Argumentsの意味

Argumentsは、

> **HostがそのApplicationをどう起動するか決める入力**

である。

例:

```text
instance
workers
mode
readonly
shard
storageDriver
```

CLIを使う場合はargvから作ってもよい。

```ts
const argv = await yargs(...).parse()

bootstrap({
  application,

  arguments: {
    instance: argv.instance,
    workers: argv.workers,
  },
})
```

しかしArguments自体はCLIではない。

Electron:

```ts
bootstrap({
  application,
  arguments: configFromDesktopUI,
})
```

Test:

```ts
bootstrap({
  application,
  arguments: {
    instance: 'test',
    workers: 1,
  },
})
```

Custom host:

```ts
bootstrap({
  application,
  arguments: hostConfiguration,
})
```

すべて同じ意味論である。

---

## 3.4 EnvironmentとArgumentsの責務差

|                   | Environment                              | Arguments                     |
| ----------------- | ---------------------------------------- | ----------------------------- |
| 意味              | Applicationが置かれた環境                | Applicationがどう起動されたか |
| owner             | Runtime / Deployment                     | Host                          |
| contract owner    | Module                                   | Application                   |
| contract数        | 0..N                                     | 0..1                          |
| merge             | しない。同じraw sourceを各Contractが読む | そもそも複数登録不可          |
| DI                | `inject(AppEnv)`                         | `inject(AppArgs)`             |
| Provider topology | 使用可                                   | 使用可                        |
| CLIとの関係       | 原則なし                                 | CLI Hostがsourceを作ってよい  |
| secret向き        | 適する                                   | CLI由来なら原則不向き         |

特にsecretはArgumentsへ寄せない。

CLI引数はshell historyやprocess metadataへ露出する可能性があるため、password/token/secretはEnvironmentやruntime-native secret bindingを優先する。

---

# 4. Arguments ContractはApplicationに0..1

ArgumentsをModuleごとに複数登録してmergeする設計は採用しない。

禁止:

```ts
defineModule(() => ({
  arguments: [DatabaseArgs, WorkerArgs],
}))
```

禁止:

```text
DatabaseArgs
    +
WorkerArgs
    ↓
implicit merge
```

理由:

- strict schema同士へ同一raw objectを渡すとunknown keyで競合し得る
- 同じkeyの型衝突にmerge順が必要になる
- cross-field validationのownerが不明になる
- reusable ModuleがApplication public invocation contractを暗黙に増やす
- `bootstrap({ arguments })` の型がModule import graphにより不透明になる

Arguments ContractはApplicationが直接0..1個だけ宣言する。

```ts
class AppArgs extends defineArgs(
  z.object({
    instance: z.string(),

    workers: z.number().int().positive().default(4),

    database: z.object({
      poolSize: z.number().default(10),
    }),
  }),
) {}

const application = defineApplication({
  modules: [AppModule()],

  arguments: AppArgs,
})
```

Hostは一つのApplication input contractだけを見る。

```ts
bootstrap({
  application,

  arguments: {
    instance: 'production',
    workers: 8,

    database: {
      poolSize: 20,
    },
  },
})
```

Reusable Module固有のconstruction-time設定は既存Module argsを使う。

```ts
const DatabaseModule = defineModule<{
  poolSize: number
}>((options) => ({
  providers: [provide(DatabaseOptions).useValue(options)],
}))
```

```ts
defineApplication({
  modules: [
    DatabaseModule({
      poolSize: 20,
    }),
  ],

  arguments: AppArgs,
})
```

Host起動時に変えたい値だけApplication Argumentsへ昇格させる。

---

# 5. `defineArgs()`

## 5.1 API

ArgumentsはCLI metadataを持たない。

```ts
class AppArgs extends defineArgs(
  z.object({
    instance: z.string(),
    workers: z.number().default(4),
  }),
) {}
```

以下は存在しない。

```ts
option(...)
flags
short
long
positionals
commands
help
```

概念型:

```ts
export type ArgsSchema = StandardSchemaV1<unknown, object>

export interface ArgsClass<
  TSchema extends ArgsSchema = ArgsSchema,
> extends Class<SchemaOutput<TSchema>> {
  readonly kind: 'arguments'
  readonly schema: TSchema

  key<TKey extends keyof SchemaOutput<TSchema> & string>(
    key: TKey,
  ): ArgsKey<SchemaOutput<TSchema>[TKey]>
}

export function defineArgs<TSchema extends ArgsSchema>(
  schema: TSchema,
): ArgsClass<TSchema>
```

ApplicationからDIで見えるのはStandard Schema transform後output。

```ts
const Schema = z
  .object({
    WORKERS: z.coerce.number(),
  })
  .transform((input) => ({
    workers: input.WORKERS,
  }))

class AppArgs extends defineArgs(Schema) {}

class Worker {
  constructor(readonly args = inject(AppArgs)) {}

  run() {
    this.args.workers
  }
}
```

---

# 6. `RuntimeInputKey`

EnvironmentとArgumentsはconditional Provider selectionに使える。

現在Environment専用のkey abstractionをApplication Runtime Inputへ一般化する。

概念:

```ts
export interface RuntimeInputKey<TValue = unknown> {
  readonly kind: 'runtime-input-key'

  readonly source: 'environment' | 'arguments'

  readonly contract: EnvClass | ArgsClass

  readonly key: string

  readonly '~value'?: TValue
}
```

`AppEnv.key()`:

```ts
provide(Storage).select(AppEnv.key('storageDriver'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
```

`AppArgs.key()`:

```ts
provide(Storage).select(AppArgs.key('storageDriver'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
```

原則:

> **Application-scoped Runtime InputはProvider topologyへ影響してよい。Execution-scoped Inputは影響してはならない。**

---

# 7. `bootstrap()` API

## 7.1 positional application argumentを廃止

旧:

```ts
bootstrap(application, {
  environment,
})
```

新:

```ts
bootstrap({
  application,
  environment,
  arguments,
})
```

すべてnamed propertyとする。

理由:

- Host boundaryの意味が明示的
- `environment` / `arguments` が対等に見える
- 将来Host bindingが増えても第二引数objectの責務が肥大化しない
- AI / IDE / code reviewでproperty semanticsが明確
- argument順序に意味を持たせない

---

## 7.2 型

概念:

```ts
export interface BootstrapBaseOptions<
  TApplication extends ApplicationDefinition,
> {
  readonly application: TApplication
  readonly environment?: unknown
}
```

Argumentsの有無はApplication Definitionから導出する。

```ts
type BootstrapArguments<TApplication extends ApplicationDefinition> =
  TApplication['arguments'] extends ArgsClass<infer TSchema>
    ? {} extends SchemaInput<TSchema>
      ? {
          readonly arguments?: SchemaInput<TSchema>
        }
      : {
          readonly arguments: SchemaInput<TSchema>
        }
    : {
        readonly arguments?: never
      }
```

最終的には概念上:

```ts
export function bootstrap<const TApplication extends ApplicationDefinition>(
  options: BootstrapBaseOptions<TApplication> &
    BootstrapArguments<TApplication>,
): HostedApplication<TApplication>
```

Arguments Contractを宣言していないApplicationでは、

```ts
bootstrap({
  application,
  arguments: {},
})
```

を型エラーにする。

Arguments Schema inputが `{}` を許容する場合は `arguments` 自体を省略可能にしてよい。

```ts
class AppArgs extends defineArgs(
  z.object({
    workers: z.number().default(4),
  }),
) {}
```

```ts
bootstrap({
  application,
})
```

は `{}` をraw argumentsとして扱える。

一方required fieldがある場合:

```ts
class AppArgs extends defineArgs(
  z.object({
    instance: z.string(),
  }),
) {}
```

`arguments` は型上requiredにする。

---

# 8. `Entrypoint` conceptを廃止する

`Entrypoint` は名前に対して責務が広すぎる。

旧:

```text
Entrypoint
├ manual Host execution
├ cron target
├ fixed-delay target
└ queue-consumer target
```

これを `Task` へ置換する。

Task:

> **DIを利用でき、HostまたはTriggerからinvokeされる型付きApplication operation**

API:

```ts
export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDescriptor<
  TInput = void,
  TOutput = void,
  TName extends string = string,
> {
  readonly kind: 'task'
  readonly name: TName

  readonly factory: () => TaskRuntime<TInput, TOutput>
}
```

```ts
export function task<
  TInput = void,
  TOutput = void,
  const TName extends string = string,
>(declaration: {
  readonly name: TName

  readonly factory: () => TaskRuntime<TInput, TOutput>
}): TaskDescriptor<TInput, TOutput, TName>
```

例:

```ts
const migrate = task<MigrateInput, MigrateResult>({
  name: 'db.migrate',

  factory:
    (
      migrations = inject(MigrationService),

      args = inject(AppArgs),
    ) =>
    async (input) => {
      return migrations.run({
        instance: args.instance,
        ...input,
      })
    },
})
```

Task factoryは既存Entrypointと同じく同期constructionとする。

```text
factory()
  ↓
TaskRuntime function
  ↓
runtime cache
  ↓
executionごとにinvoke
```

async factoryは認めない。

---

# 9. Taskはvalidation boundaryではない

Task descriptor自体にStandard Schemaを要求しない。

禁止するcanonical design:

```ts
task({
  input: SomeSchema,
  ...
})
```

理由:

Taskはprotocol / transport boundaryではない。

外部data validationは外部boundaryが所有する。

```text
CLI Host
  yargs / Zod / Valibot
        ↓
       Task

HTTP
  Contract / Protocol Schema
        ↓
 Implementation
        ↓
      business logic

Queue
  Queue Payload Schema
        ↓
       Task
```

例えばCLI Host:

```ts
const input = MigrateInput.parse(raw)

await app.run(migrate, input)
```

Queue:

```text
raw queue payload
       ↓
Queue Standard Schema
       ↓
typed payload
       ↓
Task
```

TaskにSchemaを重ねて二重validationしない。

原則:

> **値の正当性はexternal boundary、Application operationの型はTask。**

---

# 10. Task output

Task outputは `void` に制限しない。

```ts
const generateReport = task<ReportInput, Report>({
  name: 'report.generate',

  factory:
    (service = inject(ReportService)) =>
    async (input) => {
      return service.generate(input)
    },
})
```

Host:

```ts
const report = await app.run(generateReport, input)
```

TriggerがTask outputを使用しない場合は単純に破棄する。

Taskの汎用性をHost integrationのために維持する。

---

# 11. Public Task と Trigger-only Task

すべてのTaskをHostから直接実行可能にしない。

Application Definitionで明示した `tasks` のみpublic Taskとする。

```ts
const application = defineApplication({
  modules: [AppModule()],

  tasks: [migrate, rebuildSearchIndex],

  triggers: [nightlyCleanup],
})
```

意味:

```text
tasks
  = Hostへ公開するApplication operation surface
```

Trigger targetはtriggerから自動収集する。

```ts
const nightlyCleanup = cron({
  name: 'nightly-cleanup',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',

  task: cleanup,
})
```

`cleanup` を `tasks` に二重登録する必要はない。

```text
Task
├ public
│   └ definition.tasks
│       └ app.run()可能
│
└ internal
    └ Triggerからreachable
        └ framework internal invokeのみ
```

同一TaskがpublicかつTrigger targetであってもidentityでdedupeする。

---

# 12. Hosted Application `run()`

Applicationがpublic Taskを持つ場合のみ `app.run()` を型surfaceへ追加する。

```ts
interface TaskApplicationCapability<TTasks extends readonly TaskDescriptor[]> {
  run<TTask extends TTasks[number]>(
    task: TTask,
    ...args: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>>
}
```

例:

```ts
const application = defineApplication({
  modules: [AppModule()],

  tasks: [migrate],
})

const app = bootstrap({
  application,

  arguments: {
    instance: 'production',
  },
})

await app.run(migrate, {
  revision: 'latest',
})
```

public Taskを持たないApplicationでは `app.run` 自体を型から消す。

Trigger-only Taskを `app.run()` へ渡すことも型上禁止する。

runtimeでもpublic Task registrationを検証し、型を迂回された場合に未登録Taskを拒否する。

---

# 13. Trigger

Triggerはbusiness logicを持たない。

```text
Trigger
   │
   ▼
 Task
   │
   ▼
Application Runtime
```

Trigger descriptorは、

- いつ発火するか
- external payload boundaryが何か
- どのTaskを呼ぶか

だけを宣言する。

---

## 13.1 Cron

```ts
const cleanup = task({
  name: 'maintenance.cleanup',

  factory:
    (service = inject(CleanupService), args = inject(AppArgs)) =>
    async () => {
      await service.cleanup({
        workers: args.workers,
      })
    },
})

const nightlyCleanup = cron({
  name: 'nightly-cleanup',

  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',

  overlap: 'skip',

  task: cleanup,
})
```

Cron Task inputは `void` に制約する。

Task outputは任意だがTriggerは破棄する。

---

## 13.2 Fixed Delay

```ts
const pollRemote = task({
  name: 'remote.poll',

  factory:
    (poller = inject(Poller)) =>
    async () => {
      await poller.run()
    },
})

const polling = fixedDelay({
  name: 'remote.poll.loop',

  delay: 5_000,
  immediate: true,

  task: pollRemote,
})
```

Fixed Delay Task inputも `void` に制約する。

---

## 13.3 Queue Consumer

Queueはexternal payload validation boundaryである。

```ts
const Orders = queue({
  name: 'orders',
  payload: OrderSchema,
})

const processOrder = task<Order, void>({
  name: 'orders.process',

  factory:
    (orders = inject(OrderService)) =>
    async (order) => {
      await orders.process(order)
    },
})

const orderConsumer = consume({
  name: 'orders.consumer',

  queue: Orders,

  task: processOrder,
})
```

型制約:

```text
QueuePayload<TQueue>
        ==
TaskInput<TTask>
```

runtime:

```text
unknown payload
       ↓
Queue Standard Schema
       ↓
validated payload
       ↓
Task runtime
```

Queue payloadとTask inputの型一致をcompile-timeで要求する。

---

# 14. `defineApplication()`

Canonical shape:

```ts
export interface ApplicationDefinitionOptions<
  TModules,
  TArguments,
  TTasks,
  TTriggers,
> {
  readonly modules: TModules

  readonly arguments?: TArguments

  readonly tasks?: TTasks

  readonly triggers?: TTriggers

  readonly logger?: Logger
}
```

利用:

```ts
export const application = defineApplication({
  modules: [AppModule()],

  arguments: AppArgs,

  tasks: [migrate, rebuildSearchIndex],

  triggers: [nightlyCleanup, orderConsumer],
})
```

削除:

```ts
entrypoint
entrypoints
```

互換aliasは作らない。

---

# 15. Runtime registration

Application RuntimeはTaskを次から収集する。

```text
definition.tasks
+
definition.triggers[].task
```

identityでdedupeする。

概念:

```ts
function registeredTasks(
  definition: ApplicationDefinition,
): readonly TaskDescriptor[] {
  return [
    ...new Set([
      ...definition.tasks,

      ...definition.triggers.map((trigger) => trigger.task),
    ]),
  ]
}
```

ただしpublic Task Setとregistered Task Setは区別する。

```text
registeredTasks
  = runtimeがprepareしてよいTask

publicTasks
  = app.run()からinvokeしてよいTask
```

runtime public `run()` pathはpublicTasksだけを受け付ける。

Trigger internal pathはregisteredTasksからTaskをinvokeする。

---

# 16. Runtime initialization

Hosted Application initializationは次の順序を保証する。

```text
bootstrap(...)
        │
        ▼
Application Graph validation
        │
        ▼
Environment Binding
        │
        ▼
Arguments Binding
        │
        ▼
Runtime preparation
├ Providers
├ Implementations
├ Layers
└ Tasks
        │
        ▼
Lifecycle
        │
        ▼
Ready
```

重要:

> Provider constructor / factory、Implementation factory、Layer factory、Task factoryが実行される時点で、validated Environment / Argumentsは既にDI可能である。

Arguments binding failure時はruntime constructionへ進まない。

Environment bindingと同じrollback / initialization semanticsを使う。

---

# 17. Graph Probe

ArgumentsもEnvironmentと同じくGraph Probeではopaque runtime valueとする。

```text
probe Task
   │
   ├ inject(Service)
   │
   └ inject(AppArgs)
             │
             ▼
      dependency edge記録
             │
             ▼
      concrete value access
             │
             ▼
        Probe Boundary
```

Argumentsの実値をGraph compile時に要求しない。

opaque placeholderを利用し、value-dependent constructionへ到達した時点で正常なProbe Boundaryとして扱う。

Graph ProbeのためにApplication codeへdummy argumentsを要求しない。

---

# 18. Graph IR

本変更はGraph schema breaking changeとする。

現行Graphの `entrypoint` conceptを削除し、Taskへ置換する。

Graph IR versionは既存versionとの衝突を避けて次versionへ上げる。

## 18.1 Task

```ts
export interface TaskIR {
  readonly id: `task:${string}`

  readonly name: string

  readonly public: boolean
}
```

Task DI nodeも `kind: 'task'` とする。

---

## 18.2 Execution Root

External execution roots:

```ts
export type ExecutionRootIR =
  ProtocolExecutionRootIR | TaskExecutionRootIR | TriggerExecutionRootIR
```

Public TaskのみTask Execution Rootになる。

Trigger-only TaskはTask nodeだがRootではない。

```text
public task

task:db.migrate
  └ MigrationService
```

```text
trigger-only task

trigger:nightly-cleanup
       │
       ▼
task:maintenance.cleanup
       │
       ▼
CleanupService
```

---

## 18.3 Trigger IR

TriggerはTask名を参照する。

```ts
interface TriggerExecutionRootIR {
  readonly id: `trigger:${string}`

  readonly kind: 'trigger'

  readonly trigger: 'cron' | 'fixed-delay' | 'queue-consumer'

  readonly name: string

  readonly task: string
}
```

`entrypoint` fieldは削除する。

---

## 18.4 Arguments IR

Application DefinitionがArguments Contractを持つ場合、Graphにcontract identityを持たせる。

```ts
interface ApplicationArgumentsIR {
  readonly name: string
}
```

Argumentsの実値はGraph / Manifest / diagnostics / logへ含めない。

Environment secretを含めない既存原則と同じ。

DI provider kind:

```ts
kind:
  | 'class'
  | 'value'
  | 'factory'
  | 'conditional'
  | 'environment'
  | 'arguments'
```

Conditional edgeにはRuntime Input sourceを明示する。

```ts
condition: {
  source:
    | 'environment'
    | 'arguments'

  contract: string
  key: string
  equals: PropertyKey
}
```

---

# 19. `compileApplication()` は純粋のまま

`compileApplication()` はstatic Application Graph compilerであり、runtime hostではない。

維持:

```ts
const result = compileApplication({
  modules,
  arguments,
  tasks,
  triggers,
})
```

返すもの:

```text
Graph
Diagnostics
```

持たせない:

```ts
compileApplication(...).run(...)
compileApplication(...).listen(...)
compileApplication(...).bootstrap(...)
```

実行はHosted Applicationの責務。

```ts
const app = bootstrap({
  application,
  environment,
  arguments,
})

await app.run(task, input)
```

---

# 20. LoutreはApplication CLIを持たない

Loutre Core/Applicationは以下を定義しない。

```text
CLI command
CLI option
short flag
long flag
positionals
subcommands
nested subcommands
-h / --help
usage
completion
argv parser
```

Application CLIはHost側で自由に選択する。

```text
yargs
Commander
clipanion
node:util.parseArgs
custom parser
```

Loutre package graphへyargs等を依存追加しない。

---

# 21. CLI Host例

```ts
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { bootstrap } from '@loutrejs/application'

import { application } from './app.js'

import { migrate } from './tasks.js'

const argv = await yargs(hideBin(process.argv))
  .option('instance', {
    alias: 'i',
    type: 'string',
    demandOption: true,
  })
  .option('workers', {
    alias: 'w',
    type: 'number',
    default: 4,
  })
  .command(
    'db migrate [revision]',
    'Run migrations',

    (command) =>
      command
        .positional('revision', {
          type: 'string',
        })
        .option('dry-run', {
          type: 'boolean',
          default: false,
        }),

    async (argv) => {
      const app = bootstrap({
        application,

        environment: process.env,

        arguments: {
          instance: argv.instance,

          workers: argv.workers,
        },
      })

      try {
        const result = await app.run(migrate, {
          revision: argv.revision,

          dryRun: argv.dryRun,
        })

        console.log(result)
      } finally {
        await app.close('cli-complete')
      }
    },
  )
  .demandCommand()
  .strict()
  .help()
  .parse()
```

このコードのCLI semanticsはyargsが所有する。

Loutreはstructured ArgumentsとTask invocationだけを知る。

---

# 22. HTTP + Trigger + Arguments

ArgumentsはCLI Task専用ではない。

同じApplication ArgumentsをHTTP / Provider / Trigger Taskから利用できる。

```ts
class AppArgs extends defineArgs(
  z.object({
    instance: z.string(),
    workers: z.number(),
  }),
) {}
```

HTTP:

```ts
const UsersHttp = implementation({
  // ...

  factory: (
    users = inject(UserService),

    args = inject(AppArgs),
  ) => ({
    async list(ctx) {
      return users.list({
        instance: args.instance,
      })
    },
  }),
})
```

Task:

```ts
const cleanup = task({
  name: 'maintenance.cleanup',

  factory:
    (
      service = inject(CleanupService),

      args = inject(AppArgs),
    ) =>
    async () => {
      await service.run({
        workers: args.workers,
      })
    },
})
```

同一Hosted Application lifetimeでは同じvalidated AppArgs instanceを見る。

---

# 23. Callback Runtime

Lambda / workerd等でもApplication sourceは変更しない。

runtime-specific adapter / generated bindingがHostとしてEnvironment / Arguments sourceを供給する。

概念:

```ts
createInvocationBinding({
  application,
  environment,
  arguments,
})
```

Application codeはruntime名を知らない。

Arguments Contractを持つApplicationに対してcallback adapterがargumentsを供給できない場合、そのadapter / deployment binding側のconfiguration errorとする。

Application ArgumentsをHTTP requestごとに変えるものとして扱ってはならない。

ArgumentsはApplication lifetime単位で固定される。

requestごとに変わる値はExecution input / Contextへ置く。

---

# 24. `@loutrejs/cli` の責務

`@loutrejs/cli` はApplication-specific CLI frameworkではなくdeveloper toolingとする。

Canonicalに残す:

```text
loutre check
loutre doctor
loutre graph
loutre explain
loutre build
```

削除:

```text
loutre run
```

現行のApplication Definitionを直接Hostする `loutre start` / `loutre dev` もcanonical execution pathから外す。

理由:

- Application-specific Argumentsを扱うためにargv ownershipをLoutreへ戻してしまう
- user HostとLoutre Hostの二重起動モデルになる
- yargs / Commander等のCLI semanticsを透過的に渡せない
- Loutreがprocess runner / CLI framework化する

開発時はHost entryを通常のruntime toolで起動する。

例:

```text
tsx watch src/main.ts
node dist/main.js
bun run src/main.ts
```

将来developer convenience commandを再導入する場合も、Application Definitionを直接HostしてApplication Argumentsを解釈するものにはしない。

---

# 25. Diagnostics

最低限次を定義する。

## Arguments

### `LUTRE_ARGS_001`

runtime-managed Argsとnormal Providerの二重宣言。

### `LUTRE_ARGS_002`

`inject(AppArgs)` しているがApplicationにそのArguments Contractが宣言されていない。

### `LUTRE_ARGS_003`

Arguments Standard Schema validation failure。

raw secret / raw source値をmessageへ出さない。

### `LUTRE_ARGS_004`

Application Definitionへ複数Arguments Contractを登録しようとした不正定義。

canonical type APIでは原則発生しないがruntime validationでも守る。

---

## Task

### `LUTRE_TASK_001`

Task name duplicate。

### `LUTRE_TASK_002`

Host `app.run()` がpublic登録されていないTaskを実行しようとした。

### `LUTRE_TASK_ASYNC_FACTORY`

Task factoryがPromiseを返した。

### `LUTRE_TASK_FACTORY_RESULT`

Task factoryがcallable runtimeを返さなかった。

---

## Trigger

既存Trigger diagnosticsを維持しつつ、message / pathの `Entrypoint` 表記を `Task` へ変更する。

Queue payload / Task input不一致は型エラーを主経路とし、Graph static validationでも検出可能な範囲を検証する。

---

# 26. Breaking Migration

## 26.1 Entrypoint

Before:

```ts
const rebuild = entrypoint({
  name: 'rebuild',

  factory:
    (service = inject(Service)) =>
    async () => {
      await service.run()
    },
})
```

After:

```ts
const rebuild = task({
  name: 'rebuild',

  factory:
    (service = inject(Service)) =>
    async () => {
      await service.run()
    },
})
```

---

## 26.2 Application manual root

Before:

```ts
defineApplication({
  modules: [AppModule()],
  entrypoint: rebuild,
})
```

After:

```ts
defineApplication({
  modules: [AppModule()],

  tasks: [rebuild],
})
```

---

## 26.3 Trigger

Before:

```ts
cron({
  name: 'nightly',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',

  entrypoint: cleanup,
})
```

After:

```ts
cron({
  name: 'nightly',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',

  task: cleanup,
})
```

---

## 26.4 Bootstrap

Before:

```ts
const app = bootstrap(application, {
  environment: process.env,
})
```

After:

```ts
const app = bootstrap({
  application,

  environment: process.env,

  arguments: {
    instance: 'production',
  },
})
```

---

## 26.5 CLI run

Before:

```text
loutre run app.ts --input '{...}'
```

After:

Application-specific Hostを作る。

```ts
const app = bootstrap({
  application,
  arguments,
})

await app.run(task, input)
```

CLI syntaxはyargs等で定義する。

---

# 27. Implementation Plan

実装順序を固定する。

## Phase 1: Arguments Contract

- `defineArgs()`
- `ArgsClass`
- `ArgsKey`
- ApplicationDefinition `arguments?: ArgsClass`
- multiple Argumentsを型/APIで禁止
- Standard Schema binding
- runtime-managed Arguments provider
- Graph Probe opaque Arguments
- type tests

## Phase 2: Runtime Input abstraction

- `RuntimeInputKey`
- `EnvKey` / `ArgsKey` specialization
- conditional Provider `select()`を一般化
- Graph conditional metadataへsource/contractを追加

## Phase 3: Bootstrap

- `bootstrap({ application, environment, arguments })`
- positional `bootstrap(application, options)` を削除
- Arguments bindingをEnvironment後 / runtime construction前へ追加
- conditional requiredness type test

## Phase 4: Task

- `EntrypointDescriptor` → `TaskDescriptor`
- `entrypoint()` → `task()`
- DI consumer rename
- Container cache / prepare / runtime rename
- `ApplicationRuntime.runTask()` internal substrate
- async factory / result diagnostics rename

## Phase 5: Application Task Surface

- `ApplicationDefinition.entrypoint` 削除
- `tasks?: []`
- publicTasks / registeredTasks分離
- trigger reachable Task自動収集
- Hosted `app.run(task, input)`
- public Task有無によるconditional capability
- unregistered public execution guard

## Phase 6: Trigger migration

- `trigger.entrypoint` → `trigger.task`
- cron/fixed-delay `TaskInput = void`
- queue consumer payload / Task input整合
- Trigger Host runtime migration

## Phase 7: Graph next version

- Entrypoint IR削除
- Task IR追加
- public Task root
- Trigger → Task reference
- Arguments IR / provider kind
- Graph Probe / dependency consumer更新
- manifest version更新

## Phase 8: CLI reduction

- `loutre run` 削除
- Definition直接Hostの `start` / `dev` をcanonical pathから削除
- help / tests / docs更新
- developer tooling commandだけを残す

## Phase 9: Examples / Docs

最低限追加する。

```text
examples/
├ yargs-host
├ http-with-arguments
└ trigger-with-arguments
```

同じAppArgsをHTTPとcron Taskが読むexampleを必須にする。

---

# 28. Acceptance Criteria

## Application Inputs

- [ ] `defineArgs(StandardSchema)` が使える
- [ ] ArgumentsにCLI metadataが存在しない
- [ ] Application DefinitionがArguments Contractを0..1だけ宣言できる
- [ ] ModuleはArguments Contractを追加できない
- [ ] Argumentsは暗黙mergeされない
- [ ] Environmentは既存通りModuleから複数宣言できる
- [ ] Environment / Argumentsがruntime construction前にbindされる
- [ ] `inject(AppArgs)` がProvider / Implementation / Layer / Task factoryから使える
- [ ] `AppArgs.key()` がconditional Provider selectionに使える
- [ ] Graph ProbeがArguments実値を要求しない
- [ ] Graph / ManifestへArguments実値を含めない

## Bootstrap

- [ ] `bootstrap({ application, environment, arguments })`
- [ ] 旧positional bootstrap APIを削除
- [ ] Arguments未宣言Applicationでは`arguments` propertyを型上拒否
- [ ] required Arguments Schemaでは`arguments`を型上requiredにできる
- [ ] `{}` が合法なSchemaでは`arguments`を省略できる

## Task

- [ ] `entrypoint()` を削除
- [ ] `task()` を追加
- [ ] Task input/outputを型付けできる
- [ ] TaskにStandard Schemaを要求しない
- [ ] Task factoryは同期construction
- [ ] public Taskだけ `app.run()` 可能
- [ ] Trigger-only Taskは `app.run()` できない
- [ ] public + Trigger重複Taskをidentity dedupeする

## Trigger

- [ ] `entrypoint:` を削除
- [ ] `task:` に統一
- [ ] cron/fixed-delayはvoid input Taskだけ受ける
- [ ] Queue payloadはStandard Schemaでvalidationする
- [ ] Queue payload outputとTask inputが型整合する

## Graph

- [ ] Entrypoint IRを削除
- [ ] Task IRを追加
- [ ] public TaskをExecution Rootとして表現
- [ ] Trigger-only TaskはRootにしない
- [ ] Trigger → Task関係をGraphに表現
- [ ] Arguments provider / dependencyをGraphに表現
- [ ] Runtime Input conditional sourceをGraphに表現
- [ ] Graph versionを更新

## CLI / Host

- [ ] Core/Applicationがargvを読まない
- [ ] Loutre独自CLI command / option DSLを作らない
- [ ] `loutre run` を削除
- [ ] Application CLIはyargs等の外部Hostで実装できる
- [ ] `compileApplication()` はruntime methodを持たない
- [ ] CLI / HTTP / Trigger / testsから同じApplication / Taskを利用できる

---

# 29. Non-goals

本ADRでは以下を実装しない。

- Loutre独自CLI parser
- Commander / yargs wrapper
- shell completion
- `-h` / `--help` Application DSL
- command / subcommand descriptor
- Task input自動validation
- Task retry policy
- Task persistence
- distributed Task execution
- job queue producer abstractionの一般化
- ArgumentsのModule-level merge
- EnvironmentとArgumentsのpublic API統合
- Application runtime名のDefinition埋め込み
- Service Locator
- `compileApplication().run()`

---

# 30. 最終Freeze

Loutre v0.1のApplication Input / Task / Host boundaryは次で固定する。

```text
Host
 │
 ├ Runtime / Deployment Environment
 │
 └ Application Arguments
 │
 ▼
bootstrap({
  application,
  environment,
  arguments,
})
 │
 ▼
Application Runtime
 │
 ├ Environment providers
 ├ Arguments provider
 ├ DI / Lifecycle
 ├ Protocol execution
 ├ public Task execution
 └ Trigger engine
       │
       ▼
      Task
```

Environment:

> **Runtime / Deploymentが所有する外部環境。ModuleがContractを宣言し、0..N個存在してよい。**

Arguments:

> **HostがApplicationをどう起動するか決める入力。ApplicationがContractを所有し、0..1個だけ存在する。mergeしない。**

Task:

> **HostまたはTriggerからinvokeされる型付きApplication operation。CLI semanticsや外部validationを所有しない。**

Host:

> **Applicationの起動方法を所有する。CLIを使うならargv parsing / command / help / validationはHostの責務。**

Compiler:

> **`compileApplication()` はGraphとdiagnosticsを生成する静的compilerであり、execution APIではない。**

最終原則:

> **Loutre defines the application. The host decides how it is invoked.**

> **Application codeはRuntime APIとCLI parserを知らない。**

> **Application-scoped inputはEnvironment / Arguments、execution-scoped inputはProtocol / Task / Queue boundaryに置く。**

> **GraphがApplication構造を表し、Host syntaxがGraphを歪めてはならない。**
