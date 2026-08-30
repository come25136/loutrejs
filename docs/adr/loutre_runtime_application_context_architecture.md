# ADR: Runtime Application Context

- 状態: **ACCEPTED / IMPLEMENTATION PENDING**
- 日付: 2026-08-30
- 対象: breaking change
- 更新対象:
  - `loutre_runtime_binding_lifecycle_architecture.md`
  - `loutre_startup_presentation_ownership_adr.md`
  - `loutre_unified_application_execution_architecture.md` のself-hosted startup API

## Context

LoutreのEnvironment Contractはruntime固有のEnvironment sourceをStandard Schemaで検証・変換し、Application codeへtyped valueとして公開する。

一方、long-lived runtimeの現在の起動APIはApplicationの初期化とlistener起動を一つの`serve()`で行う。

```ts
await nodeRuntime.serve({
  application,
  port: Number(process.env.PORT ?? 3000),
})
```

この形ではHTTP listenerの設定値をEnvironment Contractから取得できない。`PORT`だけがApplicationのEnvironment boundaryを迂回し、`process.env` / `Bun.env` / `Deno.env`をHost sourceへ露出させる。

Environment専用の例外的な参照APIは追加しない。Application ContextからDI instanceを取得する一般的なAPIを定義し、Host設定にも同じdependency modelを使う。

NestJSのApplication Contextもstatic providerの取得を`get()`、scoped providerの動的解決を`resolve()`として分離している。Loutreでもこの意味を混同しない。

## Decision

### 1. long-lived runtimeは`create()`とinstance `serve()`へ分離する

Node.js / Bun / Denoのcanonical startup APIを次の形にする。

```ts
const app = await nodeRuntime.create({
  application,
})

await app.serve({
  port: app.get(AppEnv).port,
})
```

Bun / Denoも同じlifecycle shapeを持つ。

```ts
const app = await bunRuntime.create({ application })
await app.serve({ port: app.get(AppEnv).port })
```

```ts
const app = await denoRuntime.create({ application })
await app.serve({ port: app.get(AppEnv).port })
```

`nodeRuntime.serve({ application, ... })`、`bunRuntime.serve({ application, ... })`、`denoRuntime.serve({ application, ... })`は削除する。breaking changeとしてcompatibility aliasは残さない。

`serve`という名前は維持する。これはHTTP listenerだけではなく、long-lived runtimeが所有するTrigger等のHost capabilityを開始する境界だからである。

### 2. `create()`はRuntime Application Contextを返す

`create()`はruntime固有Environment sourceを選択し、Application Contextを利用可能な状態まで初期化する。

```text
runtime.create()
    │
    ├─ runtime engineを検証
    ├─ native Environment sourceを取得
    ├─ binding.host(...)
    ├─ Environment / Argumentsをbind
    ├─ Providerをconstruct
    ├─ Application lifecycleをinitialize
    └─ initialized Application Contextを返す
```

Environment sourceの既定値は現在のruntime ownershipを維持する。

| Runtime | Default Environment source   |
| ------- | ---------------------------- |
| Node.js | `process.env`                |
| Bun     | `Bun.env`                    |
| Deno    | `Deno.env`から構築したsource |

明示的な`environment` overrideとApplication `arguments`は`create()`へ渡す。

```ts
const app = await nodeRuntime.create({
  application,
  environment: testEnvironment,
  arguments,
})
```

`port` / `hostname` / `shutdownHooks`はApplication Contextの入力ではなくHost起動設定なので`serve()`へ渡す。

概念的なNode.jsの型境界は次とする。Bun / Denoも同じ責務分割を持ち、listener handleだけruntime固有型にしてよい。

```ts
type NodeCreateOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: TDefinition
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

type NodeServeOptions = {
  readonly port?: number
  readonly hostname?: string
  readonly shutdownHooks?: boolean
}

interface NodeRuntimeApplication<
  TDefinition extends ApplicationDefinition,
> extends HostBindingApplication<TDefinition> {
  serve(options?: NodeServeOptions): Promise<NodeListenerHandle>
}

interface NodeListenerHandle {
  readonly server: Server
  readonly port: number
}
```

`create()`の戻り値に`application`をnestしない。生成されたApplication Context自身が`get()` / `run()` / `serve()` / `close()`等のcapabilityを持つ。

### 3. Application Contextに`get()`を追加する

Application ContextはDI tokenから既存のapplication-scoped instanceを取得できる。

概念的な型は次とする。

```ts
interface BaseApplication {
  readonly graph: ApplicationGraphIR

  get<TToken extends TokenLike>(token: TToken): TokenValue<TToken>

  init(): Promise<this>
  close(signal?: string): Promise<void>
}
```

`get()`は次を満たす。

- synchronous APIとする。
- Applicationの初期化完了後だけ利用できる。
- `scope: 'application'`の既存instanceを返す。
- Environment ContractとArguments Contractも取得できる。
- DIでinjectされるinstanceと同一instanceを返す。
- 未登録tokenを暗黙にinstantiateしない。
- `scope: 'transient'`を新規生成しない。
- lifecycle hookを`get()`呼び出しによって新たに実行しない。

したがって`get()`は内部`Container.resolve()`のpublic aliasではない。

Application Context初期化前の`get()`はApplication state errorとする。transient providerに対する`get()`も明示的に拒否する。

stateとscopeの拒否は次のerror codeへ固定する。

- 初期化前: `LUTRE_APP_NOT_INITIALIZED`
- stopping中: `LUTRE_APP_STOPPING`
- stopped後: `LUTRE_APP_STOPPED`
- transient provider: `LUTRE_DI_SCOPED_GET`

未登録tokenは既存の`LUTRE_DI_UNRESOLVED`等、token種別ごとのDI error体系を使う。scoped providerを暗黙に生成するfallbackは作らない。

### 4. `get()`はModule間visibilityを変更しない

Moduleの`exports`はModule間dependency visibilityを表す。

```text
Module A
   │ inject
   ▼
Module B provider
```

このdependencyには既存の`imports` / `exports` ruleを適用する。

一方、`app.get()`はModule内のdependency edgeではなく、組み上がったApplication ContextをHost boundaryから参照するAPIである。

```text
Runtime Host
    │ app.get(token)
    ▼
Application Context
```

そのため`app.get()`のためだけにProviderやEnvironment ContractをModuleから`exports`する必要はない。

この判断により、次のコードを要求しない。

```ts
const AppModule = defineModule(() => ({
  environment: [AppEnv],
  exports: [AppEnv], // Hostから読むためだけのexportは不要
}))
```

Module visibility validationは従来どおりModule間DIにのみ適用する。

### 5. `resolve()`は今回追加しない

LoutreのProvider scopeには`application`と`transient`が存在するが、現在の`Container.resolve()`は内部construction primitiveである。

public `resolve()`を追加すると、少なくとも次を定義する必要がある。

- scoped dependency subtreeのidentity
- 複数`resolve()`間でcontextを共有する方法
- transient instanceのlifecycle ownership
- shutdown時のcleanup
- execution / request contextとの関係

これらを定義せずに`resolve()`を`Container.resolve()`のaliasとして公開しない。

将来scoped Application Contextを設計するとき、`resolve()`をそのためのAPI名として予約する。

```ts
app.get(ApplicationScopedService)

// Future design only
await app.resolve(TransientService)
```

### 6. `serve()`はHost capabilityを開始する

`create()`完了時点ではApplication lifecycleはinitializedだが、long-lived Host capabilityはまだ開始しない。

`serve()`が次を所有する。

```text
app.serve()
    │
    ├─ Trigger Engine start
    ├─ listener bind / listen
    ├─ shutdown hooks register
    └─ Ready presentation
```

これにより、Host設定をApplication Contextから安全に読み取ってから外部side effectを開始できる。

```ts
const app = await nodeRuntime.create({ application })
const env = app.get(AppEnv)

await app.serve({
  port: env.port,
  hostname: env.hostname,
})
```

明示portがlistenできない場合は現在どおり別portへfallbackしない。port未指定時の自動incrementも現在のsemanticsを維持する。

`serve()`に失敗した場合は、開始済みHost capabilityを停止しApplication Contextもcloseする。失敗したcontextを再利用可能な状態へ戻す契約は持たない。

### 7. `close()`はRuntime Application Contextのlifetimeを閉じる

`create()`が返したApplication Context自身がlifetime ownerになる。

`serve()`前の`close()`はApplication lifecycleを終了する。

`serve()`後の`close()`は次の順で終了する。

```text
app.close()
    │
    ├─ shutdown hooksを解除
    ├─ listener / Host capabilityを停止
    ├─ active executionの終了を待つ
    └─ Application lifecycleをshutdown
```

従来の`serve()`戻り値に存在した`application`と`close()`を二重に持たせない。

`serve()`がruntime固有listener情報を返す場合、そのhandleはlistener metadataのみを持つ。

```ts
const listener = await app.serve({ port: 3000 })

listener.port
// Node.jsでは必要ならlistener.serverも公開できる

await app.close()
```

### 8. startup presentationは`create()`から`serve()`までを一つのsessionとして扱う

startup presentationのFramework ownershipは維持する。ただしlifecycle ownerをstatic `runtime.serve()`からRuntime Application Contextへ移す。

```text
runtime.create()
    │
    ├─ startup timer start
    ├─ logo / version
    ├─ Application initialize
    └─ context return
            │
            ├─ app.get(...)
            │
            └─ app.serve()
                    │
                    ├─ Trigger start
                    ├─ listen
                    └─ Ready
```

`Ready`はlistener成功後だけ表示する。startup durationにはApplication Context creationからlistener readyまでを含める。

`create()`に失敗した場合、または`serve()`がlistenに失敗した場合は`Ready`を表示しない。

通常のApplication testやruntime-neutral embeddingでstartup presentationを出す必要はないため、`bootstrap()`は従来どおりpresentationを所有しない。

## Why `create()`

`bootstrap()`はruntime-neutral primitiveであり、既定のEnvironment sourceとして`process.env` / `Bun.env` / `Deno.env`を選択しない。

今回必要なのは、Application sourceへruntime APIを漏らさずにnative Environment sourceをbindしたApplication Contextをlistener開始前に得ることなので、runtime adapterの`create()`が責務境界として適切である。

```ts
const app = await nodeRuntime.create({ application })
```

`createApplication()`のように名前を長くしない。`nodeRuntime`自体が生成対象のruntime contextを明確にしている。

## Why `get()`

`get()`は既に生成・初期化されたinstanceを取得する操作を表す。

```ts
const env = app.get(AppEnv)
const database = app.get(Database)
const service = app.get(SERVICE)
```

`resolve()`はdependency graphを辿ってinstanceを動的に解決・生成する意味と区別できる。

内部DIのconstruction API名に合わせてpublic APIを決めず、Application authorから見えるsemanticsで名前を決める。

## Example

Environment ContractがHost configurationを含む。

```ts
const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.string(),
  })
  .transform((env) => ({
    port: env.PORT,
    hostname: env.HOST,
    databaseUrl: new URL(env.DATABASE_URL),
  }))

export class AppEnv extends defineEnv(AppEnvSchema) {}
```

Application Moduleは通常どおりEnvironment Contractを宣言する。

```ts
const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [Database],
}))

export default defineApplication({
  modules: [AppModule()],
})
```

Host entryはruntime固有Environment APIを参照しない。

```ts
import { nodeRuntime } from '@loutrejs/node'
import application, { AppEnv } from './app.js'

const app = await nodeRuntime.create({ application })
const env = app.get(AppEnv)

await app.serve({
  port: env.port,
  hostname: env.hostname,
})
```

`Number(process.env.PORT ?? 3000)`のようなEnvironment parsingはHost entryから消える。

## Non-goals

今回の変更では次を行わない。

- `EnvService` / `ConfigService`のようなEnvironment専用serviceを追加しない。
- `app.resolve()`を追加しない。
- request scopeを追加しない。
- Module selection APIを追加しない。
- `app.get()`をModule間DIの代替にしない。
- Environment schemaの責務をHostへ移さない。
- callback runtimeの`bind()` / existing transportの`attach()` semanticsを変更しない。

## Implementation constraints

実装時は次を守る。

1. public `get()`を`Container.resolve()`へ単純委譲しない。
2. `get()`からtransient providerを生成しない。
3. `create()`完了前にApplication Contextを返さない。
4. `create()`ではTrigger / listenerを開始しない。
5. `serve()`成功前に`Ready`を表示しない。
6. static `runtime.serve({ application })`のcompatibility aliasを残さない。
7. Node.js / Bun / Denoで同じApplication Context lifecycleを持たせる。
8. exampleのHost entryから直接の`process.env.PORT`参照を削除し、Environment Contractへdefault / coercionを移す。

## 受け入れ条件

実装PRでは少なくとも次をテストで保証する。

1. `await nodeRuntime.create({ application })`の戻り値から、`serve()`前に`app.get(AppEnv)`できる。
2. `get()`はDIで利用するapplication-scoped providerと同一instanceを返す。
3. Environment / Arguments Contractを`get()`できる。
4. transient providerへの`get()`は`LUTRE_DI_SCOPED_GET`で失敗し、instanceを生成しない。
5. 未初期化のruntime-neutral Application Contextでは`get()`が`LUTRE_APP_NOT_INITIALIZED`で失敗する。
6. `create()`だけではlistenerとTriggerを開始しない。
7. `serve()`がTriggerとlistenerを開始し、listen成功後だけ`Ready`を表示する。
8. 明示portのlisten failureではport fallbackを行わない。
9. port未指定時の自動incrementは維持する。
10. `serve()`失敗後はApplication Contextをcloseし、再利用しない。
11. `app.close()`がlistenerとApplication lifecycleを一つのlifetimeとして終了する。
12. Node.js / Bun / DenoのHost entryから直接の`process.env.PORT`相当参照を削除できる。
13. `app.get()`のためだけにModule `exports`を追加しなくてもEnvironment Contractを取得できる。
14. `nodeRuntime.serve({ application })`等の旧static APIが型・runtimeの両方から消える。

## 参考

命名とscope semanticsの比較対象としてNestJSの公式ドキュメントを参照した。

- [Module reference](https://docs.nestjs.com/fundamentals/module-ref): `get()`はstatic instanceの取得、`resolve()`はscoped providerの動的解決として分離されている。
- [Standalone applications](https://docs.nestjs.com/standalone-applications): Application Contextから`get()`で既存providerを取得するAPI shapeを提供している。
