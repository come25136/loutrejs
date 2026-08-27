# ADR: Loutre Unified Application Execution Architecture

- 状態: **ACCEPTED / DESIGN FROZEN**
- 対象: Loutre v0.1 breaking change
- Base: `develop`
- 日付: 2026-08-26 JST
- 方針: **後方互換性より設計整合性を優先する**
- 実装担当向け注意:
  - 本 ADR は実装時の Source of Truth とする。
  - 互換 alias / compatibility layer は原則作らない。
  - 本 ADR の Non-goals を勝手に拡張しない。
  - API 名・責務境界を独自判断で変更しない。
  - まず型テストで Application capability の成立を確認してから runtime 実装へ進む。

---

## 0. 結論

Loutre の Application は HTTP Application / MessagePort Application / Worker Application / Scheduler Application のように分裂させない。

Application は一つの **portable Application Definition** として宣言し、self-hosted runtime 上で実行するときだけ **Hosted Application** へ bind する。

```text
                  Application Definition
                           │
                    Application Graph
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Protocol          Entrypoint       Trigger
          │                │                │
     ┌────┴────┐           │          ┌─────┴─────┐
     ▼         ▼           │          ▼           ▼
   HTTP   MessagePort      │       Schedule      Queue
                           │                        │
                           │                    Consumer
                           │                        │
                           └────────────┬───────────┘
                                        ▼
                                    Entrypoint
                                        │
                                        ▼
                                  Provider / Env
```

Application source は runtime を知らない。

```ts
export const application = defineApplication({
  modules: [AppModule()],

  entrypoints: [rebuildIndex],

  schedules: [nightlyCleanup],

  consumers: [orderConsumer],
})
```

Node / Bun / Deno 等の long-lived self-hosted runtime では同じ Definition を bootstrap する。

```ts
const app = bootstrap(application)

await app.init()

await app.scheduler.start()
await app.queue.listen()

await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
```

Lambda / workerd 等の callback runtime では Application source を変更しない。

```ts
export default application
```

runtime-specific bridge は build / deployment / framework-internal binding が生成・所有する。

> **Application code は Node / Bun / Deno / Lambda / workerd 等の runtime 名を知らない。**

さらに Application Graph の構成を TypeScript の API surface に反映する。

- HTTP が存在する Hosted Application にだけ `app.listen` / `app.fetch` が存在する。
- Schedule が存在する Hosted Application にだけ `app.scheduler` が存在する。
- Queue Consumer が存在する Hosted Application にだけ `app.queue` が存在する。
- HTTP が無い Application には `listen` / `fetch` を型レベルで生やさない。
- Schedule が無い Application には `scheduler` を型レベルで生やさない。
- Queue Consumer が無い Application には `queue` を型レベルで生やさない。
- callback runtime 用 Application 型には `listen` / `scheduler` / `queue` をそもそも生やさない。

runtime error で拒否するのではなく、**存在しない execution capability は autocomplete と型から消す。**

---

# 1. 背景

現在の Loutre では HTTP と MessagePort がそれぞれ独立した Application wrapper を持ち、次の責務が重複している。

- Graph compile
- `ApplicationRuntime` construction
- lifecycle ownership
- Environment initialization
- runtime logging
- implementation/layer execution preparation

一方、`ApplicationRuntime` 自体は既に protocol-neutral な基盤である。

責務は概ね以下。

```text
ApplicationRuntime
  ├ Runtime Module Graph
  ├ Container / DI
  ├ Environment binding
  ├ Application lifecycle
  ├ Provider construction
  ├ Implementation construction/cache
  └ Layer construction/cache
```

したがって HTTP / MessagePort / Worker / Scheduler を Application の「種類」として分離する必要はない。

また standalone worker / Lambda worker / scheduler / queue consumer を追加する際に、以下のような runtime-specific API を canonical public API として増殖させてはならない。

```ts
createNodeHttpServer(application)
createBunFetchHandler(application)
createDenoFetchHandler(application)

createLambdaHttpHandler(application)
createLambdaEntrypointHandler(application, entrypoint)
createLambdaScheduledHandler(application, schedule)

createNodeScheduler(application)
createBunScheduler(application)
createDenoScheduler(application)
```

内部で adapter/driver として存在することは許容する。

しかし Application 利用者へ公開すると、

> Application は portable だが、起動コードは runtime ごとに書き換える

という状態になる。

これは採用しない。

---

# 2. 設計原則

## 2.1 Application は一種類

Loutre に存在する Application concept は一つ。

以下は作らない。

```text
HttpApplication
MessagePortApplication
StandaloneApplication
WorkerApplication
SchedulerApplication
QueueApplication
```

HTTP / MessagePort は Protocol execution。

Worker は Entrypoint execution。

Schedule / Queue Consumer は Entrypoint を発火する Trigger execution。

---

## 2.2 Definition と Runtime Instance を分離する

Application Definition は portable declaration。

```ts
const application = defineApplication({
  modules: [...],
})
```

この時点では runtime side effect を持たない。

以下は存在しない。

```ts
application.init
application.listen
application.fetch
application.run
application.close
```

self-hosted runtime で bootstrap した後に Hosted Application となる。

```ts
const app = bootstrap(application)
```

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

## 2.3 Runtime 名を Application source に出さない

禁止例:

```ts
defineApplication({
  runtime: 'node',
})
```

```ts
bootstrap(application, {
  adapter: node(),
})
```

```ts
createNodeHttpServer(application)
```

canonical Application code に runtime 名を入れない。

runtime 選択が必要になるのは host / build / deployment boundary だけ。

---

## 2.4 Application Graph を autocomplete に反映する

Graph が持たない execution capability を Hosted Application に生やさない。

```ts
const workerApplication = defineApplication({
  modules: [WorkerModule()],

  entrypoints: [processJob],
})

const app = bootstrap(workerApplication)

await app.run(processJob, job)

app.listen
// Property 'listen' does not exist

app.fetch
// Property 'fetch' does not exist

app.scheduler
// Property 'scheduler' does not exist

app.queue
// Property 'queue' does not exist
```

これを本 ADR の必須要件とする。

---

# 3. 他 OSS から採用する考え方

本 ADR は他 OSS の API を直接コピーするものではない。

ただし以下の性質を採用する。

## 3.1 NestJS

採用:

- `init / listen / close` lifecycle vocabulary
- Application facade から execution を開始する DX
- HTTP と非 HTTP execution を別々に開始できる考え方

採用しない:

- runtime/transport specific configuration を Application Definition へ漏らす設計

---

## 3.2 ZeltJS

採用:

- static definition と runtime app の分離
- definition の構成に応じて runtime capability を型レベルで増減させる考え方
- namespaced capability の考え方

Loutre では以下の形にする。

```ts
app.listen(...)
app.scheduler.start()
app.queue.listen()
```

採用しない:

```ts
app.get(Service)
```

のような public Service Locator。

Loutre は Graph-first の明示的 root を維持する。

---

## 3.3 Hono

採用:

- HTTP 内部境界を Web Standard `Request -> Response` とする
- server を起動せず HTTP execution をテストできる低レベル `fetch()` API

```ts
const response = await app.fetch(new Request('http://localhost/users'))
```

採用しない:

- Node/Bun/Deno それぞれの server adapter を利用者に直接書かせる canonical DX

---

## 3.4 Fastify

採用:

- execution start API が必要に応じて Application initialization を保証する

つまり以下は合法。

```ts
await app.listen({
  port: 3000,
})
```

内部では `init()` 済みであることを保証する。

`init()` 自体は idempotent。

---

## 3.5 AdonisJS

採用:

- Graph inspection/build と runtime side effect を分離する
- HTTP server / Queue worker / Scheduler process を同じ Application Definition から別 process として起動できる考え方

例えば:

```ts
// web process
const app = bootstrap(application)
await app.listen({
  port: 3000,
})
```

```ts
// queue worker
const app = bootstrap(application)
await app.queue.listen()
```

```ts
// scheduler worker
const app = bootstrap(application)
await app.scheduler.start()
```

同じ Application Graph を使う。

---

## 3.6 Encore

採用:

- cloud/runtime 固有設定ではなく Application semantics を宣言する
- Schedule の cron/timezone を Application Definition 側に持つ
- Queue / Consumer を first-class Graph resource として扱う

採用しない:

- Loutre 自身が cloud infrastructure provisioning framework になること

Loutre は semantics と host binding の契約を提供する。

Terraform / CDK 等を置き換えない。

---

# 4. `defineApplication()`

## 4.1 API

```ts
export const application = defineApplication({
  modules: [AppModule()],

  entrypoints: [rebuildIndex],

  schedules: [nightlyCleanup],

  queues: [outgoingEvents],

  consumers: [orderConsumer],
})
```

最終 shape:

```ts
export interface ApplicationDefinitionOptions<
  TModules extends readonly AnyModuleLike[],
  TEntrypoints extends readonly EntrypointDescriptor[],
  TSchedules extends readonly ScheduleDescriptor[],
  TQueues extends readonly QueueDescriptor[],
  TConsumers extends readonly QueueConsumerDescriptor[],
> {
  readonly modules: TModules

  readonly entrypoints?: TEntrypoints
  readonly schedules?: TSchedules

  readonly queues?: TQueues
  readonly consumers?: TConsumers

  readonly logger?: Logger
}
```

`defineApplication()` は runtime instance を生成しない。

Graph compile 用の portable definition を返す。

---

# 5. Module type information を保持する breaking change

## 5.1 現在の問題

現在の `ModuleInstance` は概念的に、

```ts
interface ModuleInstance {
  readonly definition: ModuleDefinition
}
```

となっており、`defineModule()` の factory が返した literal type が消える。

この状態では TypeScript から、

```text
Application
  └ Module
       └ imported Module
            └ HTTP Implementation
```

を追跡して `app.listen` を条件付きで生やせない。

したがって breaking change を行う。

---

## 5.2 新しい ModuleInstance

```ts
export interface ModuleInstance<
  TDefinition extends ModuleDefinition = ModuleDefinition,
> {
  readonly kind: 'module-instance'

  readonly template: AnyModuleTemplate
  readonly args: unknown

  readonly definition: TDefinition

  /** @internal type-only metadata */
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}
```

ModuleTemplate も Definition 型を保持する。

```ts
export interface ModuleTemplate<TArgs, TDefinition extends ModuleDefinition> {
  (args: TArgs): ModuleInstance<TDefinition>

  readonly kind: 'module-template'

  readonly instantiate: (args: TArgs) => ModuleInstance<TDefinition>

  /** @internal */
  readonly [moduleTypeInfo]?: ModuleTypeInfo<TDefinition>
}
```

---

## 5.3 `defineModule()` は literal definition を保持する

概念型:

```ts
export function defineModule<
  TArgs = void,
  const TDefinition extends ModuleDefinition = ModuleDefinition,
>(factory: (args: TArgs) => TDefinition): ModuleTemplate<TArgs, TDefinition>
```

これにより、

```ts
const UsersModule = defineModule(() => ({
  implementations: [UsersHttpImplementation],
}))
```

から `UsersModule` が HTTP capability を含むことを TypeScript が知れる。

---

# 6. Module Type Summary

Application 側から Module Graph 全体を毎回深い conditional type で再帰探索しない。

各 Module は import 先を含む type summary を持つ。

概念:

```ts
interface ModuleTypeInfo<TProtocols extends string = never> {
  readonly protocols: TProtocols
}
```

例えば、

```ts
const UsersModule = defineModule(() => ({
  implementations: [UsersHttp],
}))
```

なら概念的に:

```text
ModuleTypeInfo<"http">
```

親 Module が UsersModule を import する場合も、

```ts
const ApiModule = defineModule(() => ({
  imports: [UsersModule()],
}))
```

ApiModule は `"http"` summary を継承する。

```text
UsersModule
  HTTP
    ↓
ApiModule
  HTTP
    ↓
ApplicationDefinition
  HTTP
    ↓
HostedApplication
  listen/fetch
```

これは runtime 用 metadata ではなく、TypeScript type propagation のための internal contract である。

実装方法は Symbol phantom property 等でよいが、public user API へ露出させない。

---

# 7. Entrypoint

## 7.1 Descriptor

```ts
export interface EntrypointDescriptor<
  TInput = unknown,
  TOutput = unknown,
  TName extends string = string,
> {
  readonly kind: 'entrypoint'
  readonly name: TName

  readonly factory: () => EntrypointRuntime<TInput, TOutput>
}
```

```ts
export type EntrypointRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>
```

---

## 7.2 利用例

```ts
const processOrder = entrypoint<Order, void>({
  name: 'orders.process',

  factory:
    (service = inject(OrderService)) =>
    async (order) => {
      await service.process(order)
    },
})
```

factory は synchronous construction。

runtime function は async 可。

禁止:

```ts
entrypoint({
  factory: async () => {
    // ...
  },
})
```

Implementation / Layer と同じ construction model に揃える。

---

# 8. Registered Entrypoint

Application で実行可能な Entrypoint は以下の union。

```text
explicit Application.entrypoints
        +
Schedule.entrypoint
        +
QueueConsumer.entrypoint
        =
RegisteredEntrypoints
```

Schedule / Consumer が参照する Entrypoint は自動登録する。

同一 descriptor は identity で dedupe。

別 descriptor が同じ `name` を持つ場合は Graph diagnostic。

---

# 9. `app.run()`

## 9.1 型

```ts
type EntrypointInput<T> =
  T extends EntrypointDescriptor<infer TInput, any, any> ? TInput : never
```

```ts
type EntrypointOutput<T> =
  T extends EntrypointDescriptor<any, infer TOutput, any> ? TOutput : never
```

```ts
type EntrypointArguments<T> = [EntrypointInput<T>] extends [void]
  ? readonly []
  : readonly [input: EntrypointInput<T>]
```

Hosted Application:

```ts
run<
  TEntrypoint extends RegisteredEntrypoint<TDefinition>,
>(
  entrypoint: TEntrypoint,
  ...args: EntrypointArguments<TEntrypoint>
): Promise<EntrypointOutput<TEntrypoint>>
```

利用:

```ts
await app.run(cleanup)
```

```ts
await app.run(processOrder, order)
```

未登録 descriptor は compile-time / runtime の両方で拒否する。

runtime は object identity を検査する。

---

# 10. Schedule

## 10.1 Application semantics として cron を持つ

Schedule は host-specific scheduler configuration ではなく、

> 「この Entrypoint を、この時間規則で起動する」

という Application semantics。

したがって cron/timezone は Schedule Descriptor に置く。

```ts
const nightlyCleanup = schedule({
  name: 'maintenance.cleanup.nightly',

  cron: {
    expression: '0 3 * * *',
    timezone: 'Asia/Tokyo',
  },

  entrypoint: cleanup,
})
```

---

## 10.2 Schedule Descriptor

```ts
export interface ScheduleDescriptor<
  TEntrypoint extends EntrypointDescriptor<void, void> = EntrypointDescriptor<
    void,
    void
  >,
  TName extends string = string,
> {
  readonly kind: 'schedule'

  readonly name: TName

  readonly cron: {
    readonly expression: string
    readonly timezone: string
  }

  readonly entrypoint: TEntrypoint
}
```

---

## 10.3 v1 cron dialect

Loutre が portable cron dialect を定義する。

v1:

```text
5-field cron
minute hour day-of-month month day-of-week
+
IANA timezone
```

`timezone` は必須。

以下は許可しない。

```ts
cron: {
  expression: '0 3 * * *',
  // timezone省略
}
```

UTC でも明示する。

```ts
cron: {
  expression: '0 3 * * *',
  timezone: 'UTC',
}
```

曖昧な default を作らない。

---

## 10.4 Scheduled Entrypoint

v1 の Schedule target は、

```text
void -> void
```

のみ。

host-specific Scheduled Context は導入しない。

以下は Application code へ自動注入しない。

```text
AWS EventBridge event
Lambda Context
Cloudflare ScheduledController
scheduledAt
retryCount
cron raw event
```

現在時刻が必要なら `Clock` service を inject する。

---

# 11. Queue

## 11.1 Queue は resource

```ts
const orders = queue<Order>({
  name: 'orders',
})
```

Queue transport は Application Definition に vendor 名として書かない。

禁止:

```ts
queue({
  provider: 'sqs',
})
```

```ts
queue({
  adapter: rabbitMq(),
})
```

Queue は logical Application resource。

---

# 12. Queue Consumer

Queue と Entrypoint を結ぶ execution declaration。

```ts
const orderConsumer = consumer({
  name: 'orders.process',

  queue: orders,

  entrypoint: processOrder,
})
```

概念型:

```ts
export interface QueueConsumerDescriptor<
  TQueue extends QueueDescriptor<any>,
  TEntrypoint extends EntrypointDescriptor<any, void>,
  TName extends string = string,
> {
  readonly kind: 'queue-consumer'

  readonly name: TName
  readonly queue: TQueue
  readonly entrypoint: TEntrypoint
}
```

Queue payload 型と Entrypoint input 型を一致させる。

```text
Queue<Order>
     ↓
Entrypoint<Order, void>
```

以下は compile error。

```ts
const wrong =
  entrypoint<string, void>(...)

consumer({
  queue: orders,
  entrypoint: wrong,
})
```

Consumer target output は v1 では `void`。

---

# 13. Queue の Application 登録

Consumer が参照する Queue は Application Graph へ暗黙登録する。

```ts
defineApplication({
  consumers: [orderConsumer],
})
```

だけで `orders` も登録される。

ただし producer-only Queue 等を将来扱うため、

```ts
queues: [outgoingEvents]
```

も `defineApplication()` に持てる。

---

# 14. Hosted Application

## 14.1 Base

```ts
export interface BaseApplication<TDefinition extends ApplicationDefinition> {
  readonly graph: ApplicationGraphIR

  init(): Promise<this>

  run<TEntrypoint extends RegisteredEntrypoint<TDefinition>>(
    entrypoint: TEntrypoint,
    ...args: EntrypointArguments<TEntrypoint>
  ): Promise<EntrypointOutput<TEntrypoint>>

  close(): Promise<void>
}
```

---

## 14.2 Conditional capability

```ts
export type HostedApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication<TDefinition> &
    (HasHttp<TDefinition> extends true ? HttpApplicationCapability : {}) &
    (HasSchedules<TDefinition> extends true
      ? SchedulerApplicationCapability
      : {}) &
    (HasConsumers<TDefinition> extends true ? QueueApplicationCapability : {})
```

これを API Freeze とする。

---

# 15. HTTP capability

HTTP が Graph に存在する場合のみ追加。

```ts
export interface HttpApplicationCapability {
  listen(options: HttpListenOptions): Promise<void>

  fetch(request: Request): Promise<Response>
}
```

---

## 15.1 listen options

object form のみ。

```ts
export interface HttpListenOptions {
  readonly port: number
  readonly hostname?: string
}
```

利用:

```ts
await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
```

禁止:

```ts
app.listen(3000)
```

overload / shorthand は追加しない。

AI がコードを書く前提でもあるため、省略記法より明示性を優先する。

---

## 15.2 `fetch()`

HTTP がある Application の portable low-level execution API。

```ts
const response = await app.fetch(new Request('http://localhost/users'))
```

server を起動しない HTTP test に使える。

HTTP が無い Application には `fetch` 自体を生やさない。

---

# 16. Scheduler capability

Schedule が1件以上存在する Hosted Application にだけ生やす。

```ts
export interface SchedulerApplicationCapability {
  readonly scheduler: {
    start(): Promise<void>
    stop(): Promise<void>
  }
}
```

利用:

```ts
await app.scheduler.start()
```

Schedule Definition が cron/timezone/entrypoint を持つため、起動時引数で再宣言しない。

禁止:

```ts
app.scheduler.start({
  triggers: [...],
})
```

---

# 17. Queue capability

Queue Consumer が1件以上存在する Hosted Application にだけ生やす。

```ts
export interface QueueApplicationCapability {
  readonly queue: {
    listen(): Promise<void>
    stop(): Promise<void>
  }
}
```

利用:

```ts
await app.queue.listen()
```

Consumer binding は Graph が既に知っているため、起動時に consumer list を渡さない。

禁止:

```ts
app.queue.listen({
  consumers: [...],
})
```

---

# 18. HTTP / Scheduler / Queue を統合しない

以下のような一つの `listen()` へ全 execution を詰め込む API は採用しない。

```ts
app.listen({
  http: {...},
  schedules: [...],
  queues: [...],
})
```

execution 種類ごとに API を分ける。

```ts
await app.listen({
  port: 3000,
})

await app.scheduler.start()

await app.queue.listen()
```

これにより同じ Application Definition から process role を分離できる。

---

# 19. `init()` と auto-init

`init()` は Application lifecycle initialization。

```ts
await app.init()
```

idempotent。

さらに execution start API は必要なら自動で `init()` を保証する。

以下はいずれも合法。

```ts
await app.init()
await app.listen({
  port: 3000,
})
```

```ts
await app.listen({
  port: 3000,
})
```

同様に:

```ts
await app.run(entrypoint, input)
await app.fetch(request)
await app.scheduler.start()
await app.queue.listen()
```

は内部で initialized state を保証する。

これは shorthand ではなく lifecycle safety である。

---

# 20. 二重起動

`init()` と `close()` は idempotent。

一方 execution host の二重開始は silent に飲み込まない。

```ts
await app.listen({...})
await app.listen({...})
```

```text
LUTRE_HTTP_ALREADY_LISTENING
```

```ts
await app.scheduler.start()
await app.scheduler.start()
```

```text
LUTRE_SCHEDULER_ALREADY_STARTED
```

```ts
await app.queue.listen()
await app.queue.listen()
```

```text
LUTRE_QUEUE_ALREADY_LISTENING
```

AI が誤って二重起動コードを書いた場合にも明示的に失敗させる。

---

# 21. `close()`

Application 全体を閉じる。

```ts
await app.close()
```

意味論:

```text
1. HTTP 新規受付停止
2. Scheduler 新規 trigger 停止
3. Queue 新規 message 受付停止
4. active executions 完了待ち
5. onModuleDestroy
6. beforeApplicationShutdown
7. onApplicationShutdown
8. CLOSED
```

`close()` は idempotent。

close 開始後の新規 execution は拒否。

---

# 22. Execution Gate

ApplicationRuntime に execution gate を導入する。

概念:

```text
CREATED
  │
  ▼
INITIALIZING
  │
  ▼
RUNNING
  │
  ├ HTTP execution
  ├ MessagePort execution
  ├ Direct Entrypoint execution
  ├ Schedule execution
  └ Queue Consumer execution
  │
close()
  ▼
STOPPING
  │
  ├ reject new executions
  └ wait active executions
  │
  ▼
Lifecycle shutdown
  │
  ▼
STOPPED
```

停止中:

```text
LUTRE_APP_STOPPING
```

停止後:

```text
LUTRE_APP_STOPPED
```

Application provider を active execution 中に破棄してはならない。

---

# 23. Entrypoint runtime lifecycle

Entrypoint factory は Application construction/init 時に一度だけ構築する。

```text
Application instance
    │
    └ Entrypoint runtime × 1
```

`app.run()` ごとに factory を再実行しない。

Container に概念的に以下を追加する。

```text
prepareEntrypoint()
entrypointRuntime()
probeEntrypoint()
```

Implementation / Layer と同じ framework-managed synchronous construction model とする。

---

# 24. Error policy

Entrypoint 自身は error policy を持たない。

```ts
await app.run(job, input)
```

が失敗した場合、error はそのまま reject。

host/trigger が policy を決める。

```text
Entrypoint
  └ error conversionしない

Lambda / Queue Adapter
  └ host retry / DLQ semantics

Process Scheduler
  └ log failure
     next scheduled triggerは継続
```

core scheduler に以下は持ち込まない。

```text
retry
backoff
DLQ
```

---

# 25. Scheduler overlap

v1 では overlap を許可。

```text
03:00 ─────────────────▶
        03:05 ─────────────────▶
```

次は実装しない。

```text
preventOverlap
maxConcurrency
skipIfRunning
distributed lock
misfire policy
retry policy
```

distributed deployment では process-local mutex で正しい保証を提供できない。

必要なら Application/domain 側で DB lock 等を利用する。

---

# 26. Queue transport

Queue resource と Consumer semantics は Loutre Graph に入れる。

しかし実際の transport binding:

```text
SQS
RabbitMQ
Kafka
GCP Pub/Sub
Azure Service Bus
local/in-memory
```

は別 SPI / host binding とする。

Application Definition に vendor-specific property を追加しない。

transport SPI の具体 API は本 ADR の範囲外。

---

# 27. Self-hosted bootstrap

## 27.1 `bootstrap()`

long-lived host 用 API。

対象想定:

```text
Node
Bun
Deno
Electron main
```

利用:

```ts
const app = bootstrap(application)
```

canonical API では runtime 名を要求しない。

---

## 27.2 package boundary

portable Application source と self-host bootstrap code を import boundary でも分離する。

推奨:

```ts
// app.ts
import { defineApplication } from '@loutrejs/application'
```

```ts
// main.ts
import { bootstrap } from '@loutrejs/application/host'
```

Node/Bun/Deno package 名を user code に出さない。

runtime-specific driver package は framework-internal / low-level implementation detail とする。

---

# 28. Callback runtime

Lambda / workerd 等では `bootstrap()` を user code に要求しない。

Application source:

```ts
export default application
```

generated binding が host callback と Application Definition を接続する。

callback runtime 内部で扱う型は HostedApplication ではなく Invocation Application とする。

```ts
export interface InvocationApplication<
  TDefinition extends ApplicationDefinition,
> {
  readonly graph: ApplicationGraphIR

  init(): Promise<this>

  run(...): Promise<...>

  close(): Promise<void>
}
```

ここには以下を定義しない。

```text
listen
scheduler
queue
```

つまり callback runtime で `listen()` を runtime error にするのではなく、型そのものに存在させない。

---

# 29. Runtime Adapter の public API 方針

以下は canonical public API から削除する。

```text
createNodeHttpServer
createBunFetchHandler
createDenoFetchHandler
createWorkerdFetchHandler

createLambdaHttpHandler
createLambdaHttpStreamingHandler
createLambdaEntrypointHandler
createLambdaScheduledHandler

createNodeScheduler
createBunScheduler
createDenoScheduler
```

内部 low-level API として実装することは可能。

ただし Application 利用ドキュメントの標準経路に出さない。

---

# 30. HTTP Application / MessagePort Application の廃止

削除:

```text
HttpApplication
createHttpApplication
initializeHttpApplication

MessagePortApplication
createMessagePortApplication
```

HTTP package は protocol execution logic を提供する。

MessagePort package も同様。

Graph / ApplicationRuntime / lifecycle を所有しない。

---

# 31. Protocol と Trigger の分類

Loutre の execution model を次のように分類する。

```text
HTTP
  Protocol
    ↓
Implementation

MessagePort
  Protocol
    ↓
Implementation

Direct execution
  Entrypoint

Schedule
  Trigger
    ↓
Entrypoint

Queue Consumer
  Trigger
    ↓
Entrypoint
```

Queue を HTTP のような Protocol として扱わない。

Schedule / Queue Consumer は Entrypoint trigger。

---

# 32. Module に execution roots を追加しない

`ModuleDefinition` に以下を追加しない。

```ts
entrypoints
schedules
queues
consumers
```

Module は reusable component。

execution roots/resources は Application composition の責務。

Module は今後も概念的に、

```text
imports
environment
providers
implementations
exports
lifecycle
requires
```

を持つ。

---

# 33. Graph IR v3

Graph IR は breaking change として v3 へ上げる。

```ts
export interface ApplicationGraphIR {
  readonly version: 3

  readonly modules: readonly ModuleIR[]

  readonly providers: readonly ProviderIR[]

  readonly tokens: readonly TokenIR[]

  readonly contextKeys: readonly ContextKeyIR[]

  readonly contracts: readonly string[]

  readonly pipelines: readonly PipelineIR[]

  readonly implementations: readonly ImplementationIR[]

  readonly queues: readonly QueueIR[]

  readonly executions: readonly ExecutionRootIR[]

  readonly capabilities: readonly CapabilityIR[]

  readonly nodes: readonly DependencyNodeIR[]

  readonly edges: readonly DependencyEdgeIR[]

  readonly diagnostics: readonly Diagnostic[]
}
```

---

# 34. `surface` 用語を廃止する

public/private ともに `surface` という framework-specific term は使わない。

Graph 内部では:

```ts
ExecutionRootIR
```

と呼ぶ。

ユーザー向けには普通に、

```text
HTTP
Entrypoint
Schedule
Queue Consumer
```

と表現する。

CLI に `--surface` は追加しない。

---

# 35. ExecutionRootIR

```ts
export type ExecutionRootIR =
  | ProtocolExecutionRootIR
  | EntrypointExecutionRootIR
  | ScheduleExecutionRootIR
  | QueueConsumerExecutionRootIR
```

---

## 35.1 Entrypoint

```ts
export interface EntrypointExecutionRootIR {
  readonly id: `entrypoint:${string}`

  readonly kind: 'entrypoint'

  readonly name: string
}
```

---

## 35.2 Schedule

```ts
export interface ScheduleExecutionRootIR {
  readonly id: `schedule:${string}`

  readonly kind: 'schedule'

  readonly name: string

  readonly cron: {
    readonly expression: string
    readonly timezone: string
  }

  readonly entrypoint: string
}
```

---

## 35.3 Queue Consumer

```ts
export interface QueueConsumerExecutionRootIR {
  readonly id: `queue-consumer:${string}`

  readonly kind: 'queue-consumer'

  readonly name: string

  readonly queue: string

  readonly entrypoint: string
}
```

---

# 36. QueueIR

```ts
export interface QueueIR {
  readonly id: `queue:${string}`

  readonly name: string
}
```

Queue / Consumer は execution/resource IR。

DI node にはしない。

---

# 37. Dependency Graph

Entrypoint は DI root なので `DependencyNodeIR` に追加する。

```ts
type DependencyNodeKind =
  | 'class'
  | 'token'
  | 'factory'
  | 'conditional'
  | 'environment'
  | 'implementation'
  | 'layer'
  | 'entrypoint'
  | 'framework'
```

Schedule / Queue / Consumer は DI を直接行わないため `DependencyNodeIR` へ入れない。

Graph:

```text
schedule:nightly
      ↓ execution reference
entrypoint:cleanup
      ↓ inject
CleanupService
      ↓
Database
```

```text
queue:orders
      ↓
queue-consumer:orders.process
      ↓
entrypoint:orders.process
      ↓ inject
OrderService
```

Schedule/Consumer -> Entrypoint の関係は Execution IR で表す。

Entrypoint -> Provider の関係だけ Dependency Graph へ載せる。

---

# 38. Entrypoint DI Probe

現在 Implementation / Layer factory を Graph Probe している方式を Entrypoint に拡張する。

```ts
factory: (
  service = inject(OrderService),
) => ...
```

から、

```text
entrypoint:orders.process
    ↓ inject/probed
OrderService
```

を Graph へ記録する。

DependencyConsumer に追加:

```ts
export interface EntrypointConsumer {
  readonly kind: 'entrypoint-consumer'

  readonly id: string
  readonly name: string
}
```

```ts
export type DependencyConsumer =
  TokenLike | LayerConsumer | ImplementationConsumer | EntrypointConsumer
```

`ScheduleConsumer` / `QueueConsumer` DI type は作らない。

---

# 39. `compileApplication()` breaking change

旧:

```ts
compileApplication(roots)
```

新:

```ts
compileApplication({
  modules,
  entrypoints,
  schedules,
  queues,
  consumers,
})
```

```ts
export interface ApplicationCompilationInput {
  readonly modules: readonly AnyModuleLike[]

  readonly entrypoints?: readonly EntrypointDescriptor[]

  readonly schedules?: readonly ScheduleDescriptor[]

  readonly queues?: readonly QueueDescriptor[]

  readonly consumers?: readonly QueueConsumerDescriptor[]
}
```

object parameter にする。

今後 execution/resource type が増えても positional arguments を増殖させない。

---

# 40. Graph compile 手順

実装順序は概ね以下。

```text
1. Module instance normalize
2. imported Module type/runtime graph collection
3. explicit Entrypoint collection
4. Schedule target Entrypoint collection
5. Consumer target Entrypoint collection
6. Registered Entrypoint identity dedupe
7. Entrypoint name duplicate validation
8. Schedule name duplicate validation
9. Queue resource collection
10. Consumer referenced Queue collection
11. Queue identity/name validation
12. Consumer name validation
13. Provider / Contract / Implementation collection
14. Pipeline validation
15. Provider dependency graph
16. Implementation probe
17. Layer probe
18. Entrypoint probe
19. ExecutionRootIR generation
20. QueueIR generation
21. capability generation
22. diagnostics
23. ApplicationGraphIR v3
```

---

# 41. Capability IR

Unified Application では Application 内の全 execution capability を flat union して runtime 判定してはならない。

例えば同じ Application に、

```text
HTTP
+
Lambda worker Entrypoint
```

が存在しても、worker deployment に `http.server` capability が必須とは限らない。

したがって Capability IR は application-wide と execution-specific を分ける。

```ts
export interface CapabilityIR {
  readonly name: string

  readonly scope: 'application' | 'execution'

  readonly requiredBy: string
}
```

application-wide:

```text
Module.requires
env.runtime
```

execution-specific:

```text
HTTP capability
MessagePort capability
streaming capability
Entrypoint execution capability
```

Schedule の effective capability は target Entrypoint requirements を継承。

Queue Consumer も target Entrypoint requirements を継承。

transport-specific capability は host binding 側で評価する。

---

# 42. CLI

既存の以下は Application Definition / Graph を読むだけで runtime init しない。

```text
loutre check
loutre graph
loutre explain
loutre doctor
loutre build
```

Graph inspection/build 時に DB connection 等の runtime side effect を開始しない。

---

## 42.1 Graph command

追加候補:

```bash
loutre graph executions
```

出力対象:

```text
HTTP executions
MessagePort executions
Entrypoints
Schedules
Queue Consumers
```

`surface` という用語は使わない。

---

## 42.2 `dev` / `start`

v1 は HTTP self-host command のままでよい。

HTTP execution が無い Application を `dev/start` しようとした場合は明示 error。

generic Entrypoint runner:

```text
loutre run
```

は本 ADR の Non-goal。

---

# 43. Migration

旧:

```ts
createHttpApplication({
  modules,
})
```

新:

```ts
defineApplication({
  modules,
})
```

---

旧:

```ts
HttpApplication
```

新:

```text
ApplicationDefinition
+
HostedApplication
```

---

旧:

```ts
initializeHttpApplication(...)
```

新:

```ts
app.init()
```

host environment binding は bootstrap/runtime driver が担う。

---

旧:

```ts
application.handle(request)
```

新:

```ts
app.fetch(request)
```

HTTP capability がある場合のみ。

---

旧:

```ts
createNodeHttpServer(application)
```

新:

```ts
const app = bootstrap(application)

await app.listen({
  port: 3000,
})
```

---

旧:

```ts
createMessagePortApplication(...)
```

新:

```ts
defineApplication(...)
```

MessagePort execution は unified runtime 上で行う。

---

旧:

```ts
createLambdaHandler(...)
createLambdaStreamingHandler(...)
```

新:

```text
Application Definition
+
generated runtime binding
```

user code に Lambda-specific factory を要求しない。

---

# 44. Package boundary

最終的な概念 package 構成:

```text
@loutrejs/core
  module
  provider
  inject
  contract
  implementation
  layer
  entrypoint
  schedule
  queue
  consumer

@loutrejs/runtime
  Container
  ApplicationRuntime
  lifecycle
  execution gate
  logger
  capabilities

@loutrejs/graph
  compiler
  Graph IR v3
  diagnostics
  probes

@loutrejs/application
  defineApplication
  ApplicationDefinition
  common application types

@loutrejs/application/host
  bootstrap
  HostedApplication
  host capability facade

@loutrejs/http
  HTTP Protocol
  HTTP execution internals

@loutrejs/message-port
  MessagePort Protocol
  MessagePort execution internals

@loutrejs/scheduler
  process scheduler engine
  portable cron validation

queue transport SPI package(s)
  implementation TBD

runtime drivers
  node
  bun
  deno
  workerd
  lambda
  electron
```

runtime driver package 名は canonical Application code へ露出させない。

---

# 45. Canonical example

```ts
const cleanup = entrypoint<void, void>({
  name: 'maintenance.cleanup',

  factory:
    (service = inject(CleanupService)) =>
    async () => {
      await service.cleanup()
    },
})

const nightlyCleanup = schedule({
  name: 'maintenance.cleanup.nightly',

  cron: {
    expression: '0 3 * * *',
    timezone: 'Asia/Tokyo',
  },

  entrypoint: cleanup,
})

const processOrder = entrypoint<Order, void>({
  name: 'orders.process',

  factory:
    (service = inject(OrderService)) =>
    async (order) => {
      await service.process(order)
    },
})

const orders = queue<Order>({
  name: 'orders',
})

const orderConsumer = consumer({
  name: 'orders.process',
  queue: orders,
  entrypoint: processOrder,
})

export const application = defineApplication({
  modules: [AppModule()],

  entrypoints: [rebuildIndex],

  schedules: [nightlyCleanup],

  consumers: [orderConsumer],
})
```

self-hosted:

```ts
const app = bootstrap(application)

await app.init()

await app.scheduler.start()

await app.queue.listen()

await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
```

---

# 46. Worker-only example

```ts
const processJob = entrypoint<Job, void>({
  name: 'jobs.process',

  factory:
    (service = inject(JobService)) =>
    async (job) => {
      await service.process(job)
    },
})

export const workerApplication = defineApplication({
  modules: [WorkerModule()],

  entrypoints: [processJob],
})

const app = bootstrap(workerApplication)

await app.run(processJob, job)
```

TypeScript 上:

```ts
app.listen
// error

app.fetch
// error

app.scheduler
// error

app.queue
// error
```

これは runtime diagnostic ではなく compile-time contract。

---

# 47. callback runtime example

Application source:

```ts
export default defineApplication({
  modules: [AppModule()],

  entrypoints: [processJob],

  schedules: [nightlyCleanup],
})
```

Lambda / workerd deployment bridge は framework tooling が生成する。

Application source に以下を書かせない。

```ts
createLambdaEntrypointHandler(...)
createLambdaScheduledHandler(...)
createWorkerdScheduledHandler(...)
```

---

# 48. Diagnostics

新規候補:

```text
LUTRE_ENTRYPOINT_DUPLICATE
LUTRE_ENTRYPOINT_ASYNC_FACTORY
LUTRE_ENTRYPOINT_FACTORY_RESULT

LUTRE_SCHEDULE_DUPLICATE
LUTRE_SCHEDULE_INVALID_CRON
LUTRE_SCHEDULE_INVALID_TIMEZONE

LUTRE_QUEUE_DUPLICATE
LUTRE_CONSUMER_DUPLICATE

LUTRE_APP_ENTRYPOINT_NOT_REGISTERED
LUTRE_APP_STOPPING
LUTRE_APP_STOPPED

LUTRE_HTTP_ALREADY_LISTENING
LUTRE_SCHEDULER_ALREADY_STARTED
LUTRE_QUEUE_ALREADY_LISTENING
```

DI/environment 関係は既存 diagnostic を再利用する。

```text
LUTRE_DI_UNRESOLVED
LUTRE_DI_CYCLE
LUTRE_ENV_002
...
```

Entrypoint 用に別名へ包み直さない。

---

# 49. 受け入れ条件

実装 PR は最低限以下を満たすこと。

## TypeScript

HTTP Module が存在:

```ts
app.listen
app.fetch
```

が存在する。

HTTP が存在しない:

```ts
app.listen
app.fetch
```

が compile error。

Schedule あり:

```ts
app.scheduler.start()
```

が存在。

Schedule なし:

```ts
app.scheduler
```

が compile error。

Queue Consumer あり:

```ts
app.queue.listen()
```

が存在。

Consumer なし:

```ts
app.queue
```

が compile error。

import された Module の奥に HTTP Implementation がある場合も `listen/fetch` が生える。

Schedule/Consumer が参照する Entrypoint は `app.run()` の registered union へ自動追加される。

Queue payload と Consumer Entrypoint input mismatch は compile error。

Schedule Entrypoint が `void -> void` でない場合は compile error。

---

## Runtime

- Entrypoint factory は Application instance ごとに1回だけ construction。
- `init()` は idempotent。
- execution start は auto-init。
- `close()` は idempotent。
- active execution 中に provider lifecycle teardown を開始しない。
- close 開始後は新規 execution を拒否。
- HTTP / Scheduler / Queue の二重開始は明示 error。
- Schedule execution error で process scheduler 全体を停止しない。
- direct Entrypoint error は変換せず caller へ propagate。
- HTTP / MessagePort の既存挙動を regression させない。

---

## Graph

- IR version = 3。
- Entrypoint が DI node として表示される。
- Schedule は ExecutionRoot で表現し DI node にしない。
- Queue は QueueIR resource。
- Consumer は ExecutionRoot。
- Consumer/Schedule -> Entrypoint relation が IR で追える。
- Entrypoint -> Provider relation が DI Graph で追える。
- `surface` 用語を導入しない。

---

## CLI

- `check / graph / explain / doctor / build` が Application lifecycle side effect を起動しない。
- `graph executions` から execution roots を確認できる。
- existing Graph features を壊さない。
- `dev/start` は HTTP execution の存在を明示検査する。

---

# 50. 実装順序

Codex は可能な限り次の順序で実装すること。

## Phase 1: Module type preservation

- `ModuleDefinition`
- `ModuleInstance<TDefinition>`
- `ModuleTemplate<TArgs, TDefinition>`
- `defineModule()` literal preservation
- imported Module type summary propagation
- type tests

この段階でまず、

```text
HTTP importあり -> type summaryでHTTPを検出
HTTPなし -> 検出しない
```

を証明する。

---

## Phase 2: Core execution descriptors

追加:

```text
entrypoint()
schedule()
queue()
consumer()
```

- descriptor identity
- generic type inference
- Queue/Consumer compatibility
- Schedule `void -> void` constraint
- cron/timezone structural validation contracts
- type tests

---

## Phase 3: Runtime Entrypoint

- EntrypointConsumer
- Container prepare/cache/probe
- ApplicationRuntime Entrypoint registration
- direct run execution
- execution gate
- lifecycle integration

---

## Phase 4: Graph IR v3

- object-form `compileApplication()`
- registered Entrypoint collection
- Schedule collection
- Queue/Consumer collection
- Entrypoint probe
- ExecutionRootIR
- QueueIR
- capability scope
- diagnostics
- Graph tests

---

## Phase 5: Application Definition / Hosted Application

- `@loutrejs/application`
- `defineApplication()`
- `ApplicationDefinition`
- conditional capability type
- `@loutrejs/application/host`
- `bootstrap()`
- `init/run/close`
- capability facade

この Phase で型テストを最重要とする。

---

## Phase 6: HTTP unification

- `HttpApplication` 削除
- `createHttpApplication` 削除
- Graph/runtime ownership を Application へ移動
- Hosted `app.fetch`
- Hosted `app.listen`
- current HTTP regression tests

---

## Phase 7: MessagePort unification

- `MessagePortApplication` 削除
- `createMessagePortApplication` 削除
- shared ApplicationRuntime へ統合
- current streaming/regression tests

---

## Phase 8: Scheduler

- portable cron parser/validator
- timezone handling
- process scheduler engine
- `app.scheduler.start/stop`
- active scheduled task tracking
- overlap allowed
- error logging semantics

---

## Phase 9: Queue facade / SPI foundation

- Queue/Consumer runtime metadata
- `app.queue.listen/stop`
- transport SPI boundary
- vendor-specific designは必要最小限に留める

この ADR を理由に SQS/RabbitMQ/Kafka 全実装まで広げない。

---

## Phase 10: Runtime bindings

self-host:

```text
Node
Bun
Deno
Electron
```

callback:

```text
Lambda
workerd
```

canonical user API に runtime-specific factory を露出させない。

---

## Phase 11: CLI / Build

- generic ApplicationDefinition loader
- IR v3
- `graph executions`
- capability-aware doctor
- HTTP-only `dev/start`
- callback runtime generated binding foundation

---

## Phase 12: Docs / Examples / Conformance

追加/更新:

```text
HTTP self-host
worker-only
scheduler
queue consumer
Lambda worker
Lambda scheduled
workerd
Node/Bun/Deno conformance
```

README/example に runtime-specific adapter boilerplate を canonical usage として残さない。

---

# 51. Breaking changes

以下は意図した breaking change。

```text
ModuleInstance generic化
ModuleTemplate generic化
compileApplication signature変更
Graph IR v2 -> v3

HttpApplication削除
createHttpApplication削除
initializeHttpApplication削除

MessagePortApplication削除
createMessagePortApplication削除

Lambda public handler factory整理/非canonical化

Application lifecycle API:
initialize -> init
shutdown -> close

Application Definition:
defineApplication

Self-host runtime:
bootstrap
```

0.x のため、設計を歪める compatibility alias は作らない。

---

# 52. Non-goals

本 ADR の実装で以下を追加しない。

```text
Execution-scoped DI
Invocation Context
Scheduled Context

public Service Locator

StandaloneApplication
HttpApplication
MessagePortApplication
SchedulerApplication

Module.entrypoints
Module.schedules
Module.queues
Module.consumers

app.listen(number) shorthand

single app.listen({
  http,
  schedules,
  queues
}) API

automatic retry
backoff
DLQ abstraction
concurrency policy
preventOverlap
distributed locking
misfire policy

cloud infrastructure provisioning

vendor-specific Queue API
Kafka/SQS/RabbitMQ全部入り実装

Entrypoint input/output schema

loutre run
non-HTTP dev server

surface terminology
```

実装中に「ついでに便利だから」で追加しないこと。

---

# 53. Architecture principle

本 ADR の最終原則は以下。

> **Application Definition は portable な Application Graph の宣言である。**

> **Hosted Application は現在の long-lived host 上で、その Graph が持つ execution capability だけを型付き API として公開する facade である。**

> **HTTP / MessagePort は Protocol execution、Schedule / Queue Consumer は Entrypoint Trigger、Entrypoint は direct execution root である。**

> **Application source は runtime を知らず、runtime/deployment binding は Application の外側に置く。**

> **Graph に存在しない execution capability は runtime error ではなく TypeScript の型から消す。**

この原則に反する実装上の都合が発生した場合、public API を runtime-specific に崩すのではなく内部 architecture を調整すること。

---

# 54. Codex への作業指示

この ADR を読み、`develop` の最新状態を確認した上で実装すること。

重要事項:

1. **この ADR の設計を優先する。**
2. breaking change を許容する。
3. 互換 alias を勝手に追加しない。
4. `ModuleInstance` の型消去を温存した workaround を作らない。
5. Application Graph と Hosted Application の型 capability を一致させる。
6. runtime-specific API を canonical public API へ戻さない。
7. Schedule cron/timezone は Application semantics として Descriptor 側へ置く。
8. Queue/Consumer は first-class Graph resource/execution とするが、vendor transport 実装へ scope creep しない。
9. `surface` という用語/APIを追加しない。
10. HTTP/Scheduler/Queue を一つの `listen()` にまとめない。
11. `app.listen(3000)` shorthand を追加しない。
12. callback runtime には `listen` を runtime error で残さず、型上存在させない。
13. TypeScript type tests を先に用意し、conditional capability が成立することを確認する。
14. Graph/DI/Lifecycle/HTTP/MessagePort の既存テストを破壊した場合は設計に合わせて更新し、意味論 regression がないことを確認する。
15. 実装完了後、`check` / type tests / unit tests / build / conformance を可能な限り通す。

実装中に ADR と現行コードが衝突し設計判断が必要になった場合は、独自に API を変更せず、問題点を明示して相談すること。
