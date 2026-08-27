# ADR: Trigger / Host Architecture Redesign

- 状態: **ACCEPTED / DESIGN FROZEN**
- 対象: Loutre v0.1 breaking change
- Base: `develop@d147c4476d7ab2b503ce18c0b2c54fade8589d05`
- 日付: 2026-08-27 JST
- 方針: **後方互換性より Application Graph と execution model の一貫性を優先する**
- 関連ADR: `docs/adr/loutre_unified_application_execution_architecture.md`

このADRは Unified Application Execution Architecture を否定するものではない。
同ADRで定義済みの「Applicationは一種類」「Protocol / Entrypoint / TriggerをExecution Rootとして扱う」という方針を維持したまま、現行実装で分裂している Schedule / Queue / Host の概念を整理し、実装上のSource of Truthを更新する。

本ADRの内容と旧ADRのTrigger / Scheduler / Queue / CLI Host設計が衝突する場合、本ADRを優先する。

---

## 0. 結論

Loutreのlong-lived executionは次の3種類へ整理する。

```text
Application Graph
      │
      ├ Protocol Root
      ├ Entrypoint Root
      └ Trigger Root
             │
             ├ cron
             ├ fixed-delay
             └ queue-consumer
```

ScheduleとQueue Consumerを別々のApplication capabilityとして扱わない。
どちらもEntrypointを自動発火させる **Trigger** として統一する。

Application Definitionのcanonical shapeは次とする。

```ts
export const application = defineApplication({
  modules: [AppModule()],
  entrypoints: [rebuildIndex],
  triggers: [nightlyCleanup, pollRemoteState, jobConsumer],
})
```

以下は削除する。

```ts
schedules
queues
consumers

schedule()
consumer()

app.scheduler
app.queue
```

Hosted ApplicationはTriggerを持つ場合のみ次を公開する。

```ts
await app.triggers.start()
await app.triggers.stop()
```

特定Triggerだけを起動するAPIは提供しない。
異なるprocess topologyが必要ならApplication Definition自体を分ける。

CLIの`dev` / `start`はHTTPの存在を要求しない。
Application Graphに存在するhosted execution capabilityを起動するgeneric Application Hostへ変更する。

Queue Consumerはlogical queueとruntime driverを分離する。
BullMQはcore/applicationへ埋め込まず、adapter packageとして提供する。

Queue payloadは外部入力であるためStandard Schemaによるruntime validationを必須にする。

Graph IRはv4へ更新し、Schedule / Queue Consumer固有RootをTrigger Rootへ統一する。

---

# 1. 背景

現行Loutreは型・Graph上では既に、

```text
Protocol
Entrypoint
Schedule
Queue Consumer
```

をexecution rootとして表現できる。

一方でruntime / Hosted Applicationでは、

```ts
app.listen()
app.scheduler.start()
app.queue.listen()
```

のように起動モデルが分裂している。

さらに`packages/application/src/host.ts`はHTTP executionとNode HTTP serverを直接知り、CLIの`dev` / `start`もHTTP executionを要求する。

その結果、Application Definition自体は非HTTP workerを表現できるにもかかわらず、canonical CLI Hostではそれを自然に起動できない。

またQueueはdescriptor / Graph / type surfaceだけ先行しており、現行の`queue.listen()`は実際のmessage transportへ接続しない。

Scheduleもcron専用であり、次のような一般的なworker loopをfirst-classに表現できない。

```text
start
  ↓
execute
  ↓
wait after completion
  ↓
execute
```

この状態を個別機能追加で延命せず、Trigger / Host modelを統一する。

---

# 2. 設計原則

## 2.1 TriggerはEntrypointを発火させるもの

Triggerはbusiness logicを持たない。

```text
Trigger
   │
   ▼
Entrypoint
   │
   ▼
Application Runtime
```

Cron、fixed-delay、queue consumerはいずれも同じ意味論で扱う。

Trigger descriptorは、

- いつ発火するか
- 何を入力にするか
- どのEntrypointを呼ぶか

だけを宣言する。

## 2.2 Process topologyはApplication Definitionで明示する

同じApplication Definitionを起動optionで部分的に変形しない。

禁止するcanonical DX:

```ts
await app.triggers.start(someTrigger)
await app.triggers.start({ only: ['worker-a'] })
```

processごとに必要なGraphが異なるならDefinitionを分ける。

```text
applications/
├ api.ts
├ maintenance.ts
├ importer.ts
└ worker.ts
```

これによりGraphがruntime environmentやCLI flagによって変化しない。

## 2.3 External payloadは型だけで信用しない

Queueから受信するpayloadはuntrusted inputである。
TypeScript genericだけではruntime安全性を保証できない。

したがってQueue payload schemaは必須とする。

## 2.4 Transport固有機能をcore abstractionへ膨張させない

Loutreが標準化するのは、

```text
Inbound Queue Message
        ↓
payload validation
        ↓
Entrypoint execution
```

まで。

次はqueue implementation / application adapter側の責務とする。

- producer API
- delayed job publish
- queue purge / obliterate
- transport固有retry option
- dashboard / admin API
- job naming
- transport固有metadata

## 2.5 存在しないcapabilityは型surfaceから消す

既存のUnified Application方針を維持する。

Triggerを持たないApplicationに、

```ts
app.triggers
```

は存在しない。

HTTP host capabilityを持たないApplicationに、

```ts
app.listen
app.fetch
```

は存在しない。

## 2.6 Protocol identityとHost Capabilityを分離する

Protocol名をHost capability判定へ直接使わない。

Protocolはapplication-level interaction semanticsを表し、Host Capabilityはself-hosted runtimeが何を提供すべきかを表す。

```text
Protocol
   │
   └ required host capabilities
```

Applicationの型surfaceとHost起動判定はprotocol文字列の特例ではなくcapability summaryから導出する。

これにより`@loutrejs/application`が個別Protocol名を列挙し続ける構造を避ける。

---

# 3. `defineApplication()` breaking change

## 3.1 旧API

```ts
const application = defineApplication({
  modules: [AppModule()],
  entrypoints: [rebuildIndex],
  schedules: [nightlyCleanup],
  queues: [jobs],
  consumers: [jobConsumer],
})
```

## 3.2 新API

```ts
const application = defineApplication({
  modules: [AppModule()],
  entrypoints: [rebuildIndex],
  triggers: [nightlyCleanup, pollRemoteState, jobConsumer],
})
```

概念型:

```ts
export interface ApplicationDefinitionOptions<
  TModules extends readonly AnyModuleLike[],
  TEntrypoints extends readonly EntrypointDescriptor[],
  TTriggers extends readonly TriggerDescriptor[],
> {
  readonly modules: TModules
  readonly entrypoints?: TEntrypoints
  readonly triggers?: TTriggers
  readonly logger?: Logger
}
```

`defineApplication()`は省略値を空配列へnormalizeする。

```text
entrypoints = []
triggers = []
```

Triggerから参照されるEntrypointはruntime登録対象へ自動的に含める。
`entrypoints`への重複登録は不要。

`entrypoints`は外部から明示的に`app.run()`可能なrootを宣言するために残す。

---

# 4. Trigger API

Coreのcanonical Trigger APIは次とする。

```ts
cron()
fixedDelay()
consume()
```

上位の`trigger({ type: ... })` DSLは公開しない。
kindごとの意味がAPI名から明確になることを優先する。

## 4.1 Cron

```ts
const cleanup = cron({
  name: 'cleanup',
  expression: '0 0 * * *',
  timezone: 'Asia/Tokyo',
  overlap: 'skip',
  entrypoint: cleanupExpiredData,
})
```

概念型:

```ts
export interface CronTriggerDescriptor {
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: 'allow' | 'skip'
  readonly entrypoint: EntrypointDescriptor<void, void>
}
```

### overlap

Cronは前回executionが完了する前に次のfire時刻へ到達できる。
そのためoverlap semanticsを明示する。

```ts
type CronOverlap = 'allow' | 'skip'
```

defaultは`skip`。

```ts
cron({
  name: 'cleanup',
  expression: '* * * * *',
  timezone: 'UTC',
  entrypoint: cleanup,
})
```

は`overlap: 'skip'`としてnormalizeする。

`wait`は提供しない。
Cron fireを無制限にqueueする意味になり得るため、必要なら明示的なbackpressure mechanismを利用する。

### failure

Entrypoint failureは次回cron fireを停止しない。
framework loggerへexecution failureを記録し、次回schedule evaluationを継続する。

## 4.2 Fixed Delay

```ts
const pollRemoteState = fixedDelay({
  name: 'poll-remote-state',
  delay: 10_000,
  immediate: true,
  entrypoint: refreshState,
})
```

概念型:

```ts
export interface FixedDelayTriggerDescriptor {
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly entrypoint: EntrypointDescriptor<void, void>
}
```

`delay`はmilliseconds。
0未満、非有限値、整数でない値はdefinition時に拒否する。

`immediate` defaultは`false`。

fixed-delay semantics:

```text
Trigger start
    │
    ├ immediate = true
    │       │
    │       ▼
    │    execute
    │
    └ immediate = false
            │
            ▼
         wait delay
            │
            ▼
         execute
            │
            ▼
         wait delay
            │
            ▼
           ...
```

次回delayは前回executionの完了後から計測する。

```text
execution duration
      +
fixed delay
      =
next start interval
```

したがってfixed-delayにoverlap optionは存在しない。
構造上、同一Trigger executionは重複しない。

Entrypoint failureでもloopは終了しない。
errorをloggerへ記録した後、通常どおりdelayを開始する。

## 4.3 Queue Consumer

```ts
const Jobs = queue({
  name: 'jobs',
  payload: JobSchema,
})

const jobConsumer = consume({
  name: 'process-job',
  queue: Jobs,
  entrypoint: processJob,
})
```

QueueはTriggerではなくlogical resource descriptor。
`consume()`がQueueをTriggerへ接続する。

概念型:

```ts
export interface QueueDescriptor<
  TSchema extends StandardSchemaV1,
> {
  readonly kind: 'queue'
  readonly name: string
  readonly payload: TSchema
}

export interface QueueConsumerTriggerDescriptor<
  TQueue extends QueueDescriptor<any>,
> {
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: string
  readonly queue: TQueue
  readonly entrypoint: EntrypointDescriptor<QueueOutput<TQueue>, void>
}
```

QueueのTypeScript payload型はschema outputからderiveする。

```ts
type QueueOutput<TQueue> = StandardSchemaOutput<TQueue['payload']>
```

次のphantom generic APIは削除する。

```ts
queue<Job>({ name: 'jobs' })
```

payloadなしQueueが必要なら、利用するStandard Schema側で`undefined`等を明示する。

---

# 5. Queue runtime SPI

Queue transportはCore descriptorから分離する。

```text
@loutrejs/core
    QueueDescriptor / consume()
            │
            ▼
@loutrejs/application
    Queue Consumer Runtime SPI
            │
            ▼
transport adapter
```

## 5.1 Driver contract

exact namingは実装時にpackage内整合を確認してよいが、責務は次でfreezeする。

```ts
export interface QueueConsumerDriver {
  readonly queue: QueueDescriptor<any>

  start(options: {
    consume(payload: unknown): Promise<void>
  }): Promise<QueueConsumerHandle>
}

export interface QueueConsumerHandle {
  stop(): Promise<void>
}
```

Driverはtransportからraw payloadを取得する。
ValidationとEntrypoint invocationはframework側が所有する。

```text
transport message
      ↓
unknown payload
      ↓
Standard Schema validate
      ↓
typed payload
      ↓
runtime.run(entrypoint, payload)
```

Driverがschema validationを独自実装してはならない。

## 5.2 Binding

Queue Consumer Triggerが存在するApplicationは、対応Queueのruntime driver bindingを必要とする。

Binding方法はModule/provider boundaryへ置く。
Application Definitionへruntime固有文字列を入れない。

禁止:

```ts
defineApplication({
  queueDriver: 'some-runtime',
})
```

許容される方向:

```ts
const QueueInfrastructureModule = SomeQueueModule({
  queues: [Jobs],
  connection: QueueEnv.key('url'),
})
```

Graph compile / checkで、consumerが参照するQueueにdriver bindingが存在しないことを検出可能にする。

実際のdiagnostic code名は実装時に既存namespaceへ合わせるが、runtime start時まで未bindingを放置しない。

## 5.3 BullMQ adapter

初期公式adapter packageとして次を追加する。

```text
@loutrejs/queue-bullmq
```

責務:

- BullMQ Worker construction
- QueueDescriptorとBullMQ queue nameのbinding
- message receive
- configured concurrency
- graceful worker close
- framework consumer callbackの呼び出し

Loutre側からBullMQ producer APIを再公開しない。

---

# 6. Queue producerはFramework APIにしない

LoutreのQueue abstractionはconsumer execution boundaryに限定する。

次のようなpublic APIは追加しない。

```ts
app.queue.send(...)
app.queue.delay(...)
app.queue.retry(...)
```

producer側はApplication Port / infrastructure adapterとして構成する。

理由:

1. transportごとにproducer semanticsが大きく異なる
2. delayed job、deduplication、priority、repeat、retry等を共通化すると最小公倍数APIになりやすい
3. Loutreの責務はApplication Graphからexecutionを成立させることであり、queue product全体を抽象化することではない

Queue resource descriptorはproducerから参照してよいが、送信API自体は各adapter/applicationが所有する。

---

# 7. Hosted Application capability

旧surface:

```ts
app.scheduler.start()
app.scheduler.stop()
app.queue.listen()
app.queue.stop()
```

を削除する。

新surface:

```ts
app.triggers.start()
app.triggers.stop()
```

Triggerを1つ以上持つHosted Applicationにだけ`triggers`を生やす。

概念型:

```ts
type HostedApplication<TDefinition> =
  BaseApplication<TDefinition> &
  HttpCapability<TDefinition> &
  TriggerCapability<TDefinition>
```

```ts
type TriggerCapability<TDefinition> =
  HasTriggers<TDefinition> extends true
    ? {
        readonly triggers: {
          start(): Promise<void>
          stop(): Promise<void>
        }
      }
    : {}
```

## 7.1 Partial startは提供しない

次は提供しない。

```ts
app.triggers.start(cleanup)
app.triggers.start({ only: ['cleanup'] })
```

Hosted ApplicationはDefinitionに宣言されたTrigger topologyをそのまま起動する。

別processで別Trigger集合を動かしたいなら、別Application Definitionとして表現する。

---

# 8. Trigger Engine

`@loutrejs/application`はTrigger Engineを持つ。

概念責務:

```text
Trigger Engine
   │
   ├ cron trigger runner
   ├ fixed-delay trigger runner
   └ queue-consumer trigger runner
```

Trigger EngineはApplication Runtimeを所有しない。
Hostからruntime execution callbackを受け取り、Entrypointを発火する。

## 8.1 start

`app.triggers.start()`はidempotentにはしない。
二重startはprogramming errorとして拒否する。

```text
LUTRE_TRIGGERS_ALREADY_STARTED
```

exact error codeは実装時に既存命名規則へ揃えてよい。

start時には`runtime.initialize()`済みであることを保証する。

## 8.2 stop

`stop()`は新規Trigger fireを停止する。

- cron timerを停止
- fixed-delay pending timerを解除
- queue driverへstopを要求

すでに開始済みのEntrypoint executionは強制cancelしない。
active execution drainはApplication Runtime / Host shutdown sequenceが担当する。

`stop()`は未startでも安全に完了してよい。

---

# 9. Generic Application Host

CLI `dev` / `start`はHTTP Application Loaderを使わない。

現行の、

```text
HTTP executionが存在することを確認
       ↓
HTTP Applicationとして起動
```

というモデルを廃止する。

新しいHostはApplication DefinitionをloadしてGraphのhosted capabilitiesを起動する。

```text
load Application Definition
        ↓
compile / validate Graph
        ↓
bootstrap
        ↓
init
        ↓
start hosted capabilities
        │
        ├ HTTP listener
        └ Trigger Engine
```

HTTPを持たないApplicationも正常なself-hosted Applicationである。

## 9.1 CLI start

概念:

```text
loutre start dist/application.js
```

Application Definitionを読み込み、必要なcapabilityを起動する。

HTTPのみ、Triggerのみ、HTTP + Triggerのいずれも合法。

少なくとも1つのlong-lived hosted capabilityを持たないApplicationを`start`した場合の扱いは、明示Entrypoint workerを自動実行せずdiagnostic errorとする。

`entrypoints`は`app.run()`対象であり、自動起動対象ではない。

## 9.2 CLI dev

`dev`も同じApplication Host modelを利用する。

```text
build
  ↓
host start
  ↓
watch
  ↓
change
  ↓
host close
  ↓
rebuild
  ↓
host start
```

HTTPの存在はdev mode成立条件ではない。

---

# 10. Shutdown lifecycle

Host shutdown sequenceを明示する。

```text
SIGINT / SIGTERM
      │
      ▼
stop accepting new hosted work
      │
      ├ HTTP listener close
      └ Trigger Engine stop
      │
      ▼
Application Runtime execution gate close
      │
      ▼
active execution drain
      │
      ▼
lifecycle shutdown
      │
      ▼
resource release
```

重要なのは、Trigger Engine停止とruntime shutdownを同一操作にしないこと。

Trigger停止は新規execution発生源を止める。
Runtime shutdownは実行中処理のdrainとprovider lifecycleを担当する。

`app.close()`は上記を一括して安全に行う。

## 10.1 Signal propagation

`close()`はshutdown reasonを渡せる形へ拡張する。

```ts
await app.close('SIGTERM')
```

概念型:

```ts
close(signal?: string): Promise<void>
```

signalは既存Lifecycle contractへ伝播する。

---

# 11. ProtocolとHost Capability

現行型判定で、特定protocol stringを直接Host APIへ対応付ける設計をやめる。

Protocol descriptorはrequired Host Capabilityを宣言できる。

概念:

```ts
interface ProtocolDescriptor<
  TName extends string,
  TContext,
  TResult,
  TDispatchKey extends string | null,
  TCapabilities extends readonly string[],
> {
  readonly kind: 'protocol'
  readonly protocol: TName
  readonly dispatchKey: TDispatchKey
  readonly capabilities: TCapabilities
}
```

HTTP protocolの例:

```text
protocol: http
capabilities: [http]
```

Application type summaryはprotocol一覧とは別にcapability unionを保持する。

```ts
interface ModuleTypeInfo<
  TProtocols extends string = never,
  TCapabilities extends string = never,
> {
  readonly protocols: TProtocols
  readonly capabilities: TCapabilities
}
```

Hosted Application surfaceは、

```ts
HasCapability<TDefinition, 'http'>
HasTriggers<TDefinition>
```

等から導出する。

これによりHostがprotocol名のswitch文になることを避ける。

---

# 12. Application Graph IR v4

現行v3:

```ts
type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | EntrypointExecutionRootIR
  | ScheduleExecutionRootIR
  | QueueConsumerExecutionRootIR
```

を破壊する。

v4:

```ts
type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | EntrypointExecutionRootIR
  | TriggerExecutionRootIR
```

Trigger Rootはkindごとのunionとする。

```ts
type TriggerExecutionRootIR =
  | CronTriggerExecutionRootIR
  | FixedDelayTriggerExecutionRootIR
  | QueueConsumerTriggerExecutionRootIR
```

## 12.1 Cron IR

```ts
interface CronTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: 'allow' | 'skip'
  readonly entrypoint: string
}
```

## 12.2 Fixed Delay IR

```ts
interface FixedDelayTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly entrypoint: string
}
```

## 12.3 Queue Consumer IR

```ts
interface QueueConsumerTriggerExecutionRootIR {
  readonly id: `trigger:${string}`
  readonly kind: 'trigger'
  readonly trigger: 'queue-consumer'
  readonly name: string
  readonly queue: string
  readonly entrypoint: string
}
```

Queue自体はresourceとしてGraphへ残す。

```ts
interface QueueIR {
  readonly id: `queue:${string}`
  readonly name: string
  readonly payloadSchema: string
}
```

schema全体をGraphへserializeする必要はない。
Graphではschema identity / debug representationを保持し、runtime validatorはdescriptorを利用する。

`ApplicationGraphIR.version`は`4`。

互換v3 serializerは維持しない。

---

# 13. Validation

Graph compile / definition validationで最低限次を検出する。

## 13.1 Trigger identity

同一Application内でTrigger nameはuniqueでなければならない。

```text
trigger:cleanup
```

をstable identityとする。

## 13.2 Cron

- expression parse failure
- invalid timezone
- unsupported expression
- duplicate trigger name

を起動前に検出する。

## 13.3 Fixed Delay

`delay`は、

```text
integer
finite
>= 0
```

を要求する。

## 13.4 Queue

- Queue name duplicate
- Consumer Trigger name duplicate
- Queue payload schema missing
- Consumer payload型とEntrypoint input型の不一致
- Consumer Entrypoint outputがvoidでない
- driver binding missing

を検出する。

Queue message transport起因の接続失敗はruntime errorでありGraph compile diagnosticではない。

---

# 14. Runtime error semantics

## 14.1 Cron execution failure

1 executionの失敗でTriggerを停止しない。
loggerへ記録して次回fireを継続する。

## 14.2 Fixed Delay execution failure

1 executionの失敗でloopを停止しない。
失敗後もdelayを挟んで次回executionへ進む。

## 14.3 Queue validation failure

invalid payloadはEntrypointへ渡さない。

framework callbackはfailureとしてDriverへ返す。
ack / retry / dead-letter等のtransport semanticsはDriver側が決める。

Loutre coreがtransportごとのretry policyを決定しない。

## 14.4 Queue Entrypoint failure

Entrypoint errorはDriver callback failureとして返す。
transport固有retry policyへ委ねる。

---

# 15. Logging

Trigger executionはframework loggerへstructured eventを出す。

最低限、

```text
trigger.start
trigger.stop
trigger.execution.started
trigger.execution.completed
trigger.execution.failed
trigger.execution.skipped
```

を表現可能にする。

attributes候補:

```text
trigger.name
trigger.type
entrypoint.name
queue.name
error
```

exact event nameは実装時に既存logging conventionへ揃えてよいが、Trigger kindとidentityを失わないことを必須とする。

---

# 16. Package boundary

変更後の責務は概ね次とする。

```text
@loutrejs/core
├ Entrypoint descriptor
├ Trigger descriptors
│  ├ cron
│  ├ fixed-delay
│  └ queue-consumer
├ Queue resource descriptor
└ Standard Schema payload typing

@loutrejs/graph
├ Trigger Root IR v4
├ Queue resource IR
├ capability topology
└ validation

@loutrejs/runtime
├ Entrypoint execution
├ execution gate
├ active execution drain
└ lifecycle

@loutrejs/application
├ Application Definition
├ Hosted Application capability typing
├ Trigger Engine
├ Queue Consumer Driver SPI
└ generic self-host bootstrap

@loutrejs/queue-bullmq
└ BullMQ Queue Consumer Driver

@loutrejs/cli
├ generic Application loader
├ dev host orchestration
└ start host orchestration
```

`@loutrejs/application`がBullMQ APIを直接importしてはならない。

---

# 17. Migration

## Before

```ts
const jobs = queue<Job>({
  name: 'jobs',
})

const cleanupSchedule = schedule({
  name: 'cleanup',
  cron: {
    expression: '0 0 * * *',
    timezone: 'UTC',
  },
  entrypoint: cleanup,
})

const worker = consumer({
  name: 'worker',
  queue: jobs,
  entrypoint: processJob,
})

export default defineApplication({
  modules: [AppModule()],
  schedules: [cleanupSchedule],
  queues: [jobs],
  consumers: [worker],
})
```

## After

```ts
const Jobs = queue({
  name: 'jobs',
  payload: JobSchema,
})

const cleanupTrigger = cron({
  name: 'cleanup',
  expression: '0 0 * * *',
  timezone: 'UTC',
  entrypoint: cleanup,
})

const workerTrigger = consume({
  name: 'worker',
  queue: Jobs,
  entrypoint: processJob,
})

export default defineApplication({
  modules: [
    AppModule(),
    BullMqModule({
      queues: [Jobs],
      connection: QueueEnv.key('url'),
    }),
  ],
  triggers: [cleanupTrigger, workerTrigger],
})
```

self-host manual bootstrap:

```ts
const app = bootstrap(application)
await app.init()
await app.triggers.start()
```

CLI hostならmanual trigger startは不要。

---

# 18. Breaking changes

以下はcompatibility aliasなしで削除する。

```text
ApplicationDefinition.schedules
ApplicationDefinition.queues
ApplicationDefinition.consumers
schedule()
consumer()
app.scheduler
app.queue
```

以下を追加する。

```text
ApplicationDefinition.triggers
cron()
fixedDelay()
consume()
queue({ payload })
app.triggers
Queue Consumer Driver SPI
@loutrejs/queue-bullmq
generic Application Host
Protocol Host Capability metadata
Application Graph IR v4
```

旧API名のdeprecated aliasは作らない。

---

# 19. Non-goals

本変更では次を行わない。

- 新しいProtocol / transportの追加
- Queue producer APIのframework標準化
- database / cache / object storage等の一般統合
- database transaction abstraction
- request / execution DI scope追加
- environment variableによるApplication Graph pruning
- cloud infrastructure provisioning

本ADRの目的はTrigger / Host execution architectureの整理に限定する。

---

# 20. 実装順序

実装は次の順序を推奨する。

## Phase 1: Core descriptors

1. `schedule()` / `consumer()`を削除
2. `cron()` / `fixedDelay()` / `consume()`を追加
3. Queue payload Standard Schema化
4. `ApplicationDefinition.triggers`へ変更
5. type tests更新

## Phase 2: Graph IR v4

1. Trigger Root IR追加
2. Schedule / Queue Consumer旧Root削除
3. Queue schema identity追加
4. capability summary更新
5. graph/check/explain snapshot更新

## Phase 3: Trigger Engine

1. Cron runner
2. fixed-delay runner
3. overlap `skip | allow`
4. Trigger logging
5. shutdown cancellation

## Phase 4: Queue runtime

1. Queue Consumer Driver SPI
2. binding validation
3. payload validation
4. BullMQ adapter
5. graceful close / failure propagation

## Phase 5: Host / CLI

1. HTTP-required loader削除
2. generic Application loader
3. capability-driven host start
4. signal-aware shutdown
5. `dev` / `start`更新

## Phase 6: cleanup

1. `app.scheduler`削除
2. `app.queue`削除
3. old tests / docs / examples更新
4. compatibility residueがないことを確認

---

# 21. Acceptance criteria

本ADRの実装完了条件は次。

- `defineApplication({ triggers })`でcron / fixed-delay / queue-consumerを同列に宣言できる
- Triggerを持つHosted Applicationにだけ`app.triggers`が存在する
- cron default overlapが`skip`
- fixed-delayがexecution完了後からdelayを測る
- Queue payloadがStandard Schemaでruntime validationされる
- Queue Consumerが実transport driverからEntrypointへdispatchされる
- Queue producer APIがLoutre core/applicationへ追加されていない
- Queue driver未bindingを起動前に検出できる
- CLI `dev` / `start`がHTTPを必須としない
- process topologyをApplication Definitionの分割で表現できる
- Host capability判定が特定protocol stringのhard-codeに依存しない
- SIGTERM / SIGINTでlistener / Trigger Engine停止後にactive executionをdrainする
- Graph IRがv4となりcron / fixed-delay / queue-consumerがTrigger Rootとして表現される
- 旧public APIが削除される
- compatibility aliasが存在しない

---

# 22. 最終判断

Loutreのexecution modelを次のようにfreezeする。

```text
Application
   │
   ▼
Application Graph
   │
   ├ Protocol Root
   ├ Entrypoint Root
   └ Trigger Root
          │
          ├ cron
          ├ fixed-delay
          └ queue-consumer
                 │
                 ▼
              Entrypoint
```

ScheduleとQueue Consumerは別Application subsystemではない。
**Entrypointを発火させるTriggerである。**

self-hosted executionは個別Protocolを前提とせず、Application Graphが要求するHost CapabilityとTrigger topologyから起動する。

Queueはlogical resource / inbound execution boundaryまでをLoutreが標準化し、producer product APIまでは抽象化しない。

この設計をTrigger / Host領域のcanonical architectureとする。
