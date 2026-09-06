# Loutre Runtime Environment Architecture

- 状態: IMPLEMENTED
- 対象: Loutre v0.1 breaking change
- Base: `develop`
- 日付: 2026-08-26 JST

## 0. 結論

Loutre の Environment は単なる `process.env` wrapper ではなく、次の contract として扱う。

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

> **Environment Contract = Raw Environment から Application Environment への変換 Contract**

Application code は `process.env` / `Bun.env` / `Deno.env` 等の runtime 固有 API を知らない。

Environment schema は Module が宣言し、raw Environment source は Runtime Adapter が供給する。

---

## 1. Module が Environment Contract を宣言する

Environment は HTTP / MessagePort 等の protocol の責務ではない。

```ts
const AppModule = defineModule(() => ({
  name: 'Application',
  environment: [AppEnv],
  providers: [Database],
}))
```

`environment` は raw source ではなく、Application が要求する Environment Contract の宣言である。

Application code が `provide(AppEnv).useValue(...)` を手書きしてはならない。Environment provider は framework-managed provider として runtime binding が供給する。

同じ EnvClass を複数 Module が宣言した場合は重複を統合する。

---

## 2. Standard Schema が Environment semantics を持つ

Loutre 独自の Environment validation / transformation DSL は作らない。

parse / coercion / cross-field validation / transform / derived values は Standard Schema implementation の責務とする。

```ts
const AppEnvSchema = z
  .object({
    DATABASE_URL: z.string(),
    DATABASE_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DATABASE_CA: z.string().optional(),
    CACHE_TTL: z.coerce.number().int().positive().default(60),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_SSL && !env.DATABASE_CA) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_CA'],
        message: 'DATABASE_SSL=true requires DATABASE_CA',
      })
    }
  })
  .transform((env) => ({
    database: {
      url: new URL(env.DATABASE_URL),
      ssl: env.DATABASE_SSL ? { ca: env.DATABASE_CA! } : false,
    },
    cacheTtlMs: env.CACHE_TTL * 1000,
  }))

class AppEnv extends defineEnv(AppEnvSchema) {}
```

Application から見えるのは transform 後 output である。

```ts
class Service {
  constructor(readonly env = inject(AppEnv)) {}

  run() {
    this.env.database.url
    this.env.cacheTtlMs
  }
}
```

原則:

> **値の正当性は Schema、依存 topology は Loutre Graph。**

例えば `DATABASE_SSL=true` のとき `DATABASE_CA` が必須、という rule は Schema が持つ。

一方、値により Provider topology を切り替える場合は conditional Provider を使う。

```ts
provide(STORAGE).select(AppEnv.key('storageDriver'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
```

---

## 3. `defineEnv()` の型

Environment schema の input と output は同一である必要がない。

raw runtime source は host によって異なるため input は `unknown` を許容する。

一方、DI へ公開する output は Application Environment object なので object に制約する。

`AppEnv.key()` は raw Environment key ではなく、**Standard Schema transform 後 output key** を参照する。

```ts
const Schema = z
  .object({ STORAGE_DRIVER: z.enum(['memory', 's3']) })
  .transform((env) => ({
    storageDriver: env.STORAGE_DRIVER,
  }))

class AppEnv extends defineEnv(Schema) {}

AppEnv.key('storageDriver')
```

---

## 4. Runtime Binding

Environment validation は Provider / Implementation / Layer の runtime construction より先に完了する。

```text
Application Definition
       │
       ├ modules
       └ environment declarations
               │
               ▼
Runtime Adapter
       │
       └ raw environment source
               │
               ▼
Environment Binding
       │
       ├ loadEnv(AppEnv, source)
       └ bind validated AppEnv
               │
               ▼
Runtime construction
       │
       ├ Provider constructor
       ├ Implementation factory
       └ Layer factory
               │
               ▼
Lifecycle
```

この二相 runtime は維持する。

重要なのは、runtime constructor / factory が実行される時点では **本物の validated AppEnv が既に利用可能** であること。

---

## 5. Constructor と Lifecycle

### 5.1 Constructor で Environment を使ってよい

Environment を constructor で読むことを禁止しない。

同期的に完成できる object invariant は constructor / factory で完成させる。

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

この設計では `Pool | undefined`、definite assignment assertion、初期化確認 getter 等を framework 都合で要求しない。

### 5.2 Lifecycle の責務

Lifecycle は主に次に使う。

- async startup
- readiness / health check
- 明示的な connect が必要な resource
- cleanup / shutdown

原則:

```text
constructor / factory
    ↓
同期的な object invariant を完成

onModuleInit
    ↓
非同期 startup / readiness

onModuleDestroy
    ↓
cleanup
```

JavaScript で同期 construction できるものまで Lifecycle へ追い出してはならない。

---

## 6. Application Model dependency collection

`loutre graph` / `loutre check` / `loutre build`はdeployment secretを要求しない。Runtime Containerでraw Moduleを再walkする別Graphは持たず、Application Model buildが収集したdependency edgeを正本とする。

DI dependencyはconstructor / factoryのdefault parameterへ宣言する。

```ts
constructor(
  readonly env = inject(AppEnv),
  readonly logger = inject(Logger),
) {}
```

runtime valueに応じてimperativeに`inject()` topologyを切り替える形はcanonicalにしない。

```ts
if (env.driver === 's3') {
  inject(S3Storage)
} else {
  inject(MemoryStorage)
}
```

この用途にはconditional Providerを使う。Provider implementation constructorとExecution factoryのdependency collection contractはApplication Graph Kernel ADRおよびExecution Extension Contract ADRを正本とする。

---

## 7. Runtime Adapter ごとの source

```text
Node      → process.env
Bun       → runtime environment
Deno      → Deno.env
Cloudflare Workers → fetch(request, env, ctx) の env bindings
Lambda    → Node process environment
Electron  → main process environment
```

Application code は runtime-specific API を参照しない。

Cloudflare Workers binding object には KV / D1 / Service Binding 等も存在し得るため、raw source を `Record<string, string>` に狭めない。Standard Schema へ `unknown` として渡す。

Test / embedding では runtime adapter の Environment override を利用できる。

---

## 8. Graph / Capability

Environment Contract は runtime adapter が与える environment source をProviderとして解決する。Environment自体はExecution Capabilityではないため、Graphへ `env.runtime` のような疑似Capabilityを導出しない。

Runtime CapabilityはExecution Extensionが `RuntimeCapability<T>` tokenとして要求するものだけをApplication Modelへ記録する。Module側に文字列 `requires` APIは持たせない。

Graph IR では Environment provider を framework source として表現し、Environment value / secret は Graph IR / Manifest / diagnostics / logger に含めない。

---

## 9. Diagnostics

### `LUTRE_ENV_001`

runtime-managed Env と normal Provider の二重宣言。

### `LUTRE_ENV_002`

`inject(AppEnv)` しているが、どの Module にも `environment: [AppEnv]` がない。

### `LUTRE_ENV_003`

Runtime Binding 時の Environment schema validation failure。

raw secret value を message に含めない。

Environment concrete value を Graph Probe 中に読むこと自体は diagnostic ではない。

---

## 10. `.env` file

`.env` parsing は `@loutrejs/loutre` の責務にしない。

Core は次だけを扱う。

```text
unknown raw source
        ↓
Standard Schema
        ↓
AppEnv
```

`.env` file は host/runtime policy とする。

Node CLI integration では Node native `.env` support を優先し、Loutre 独自 dotenv parser は実装しない。

---

## 11. Database examples

対象:

- `examples/database-postgres/src/app.ts`
- `examples/database-drizzle-postgres/src/app.ts`
- `examples/database-prisma-postgres/src/app.ts`

Application-level `process.env` は削除する。

DB client / pool は constructor で required readonly field として完成させる。

Lifecycle は接続確認 / explicit connect / cleanup に利用する。

Prisma CLI が直接実行する `prisma.config.ts` は Loutre Application runtime の外側なので、そこにある host Environment access は対象外。

---

## 12. Acceptance Criteria

- [x] `ModuleDefinition.environment` で Environment Contract を宣言できる
- [x] Standard Schema input / output が異なってよい
- [x] parse / coerce / cross-field validation / transform / derived values が利用できる
- [x] `defineEnv()` output は object に制約される
- [x] `AppEnv.key()` は transform 後 output key を参照する
- [x] Runtime Adapter が raw Environment source を供給する
- [x] Environment validation 後に runtime Provider / Implementation / Layer を構築する
- [x] Graph は deployment secret を要求しない
- [x] Environment value / secret を Graphへ含めない
- [x] constructor で validated Environment を利用できる
- [x] Graph Probe の Environment access は正常な Probe Boundary になる
- [x] nested Probe Boundary 後も親の後続 default-parameter dependency を収集できる
- [x] DB examples に framework都合の `Pool | undefined` / `Client | undefined` を残さない
- [x] Node / Bun / Deno / Cloudflare Workers / AWS Lambda / Electron conformance を維持する

---

## 13. Freeze

Loutre v0.1 Environment architecture の原則:

> **Application code は Runtime API を知らない。**

> **Module は Environment Contract を宣言する。Runtime Adapter は raw source を供給する。**

> **Standard Schema が raw Environment を Application Environment へ変換する。**

> **値の正当性は Schema、依存 topology は Loutre Graph。**

> **constructor / factory は同期的な object invariant を完成させてよい。**

> **Graph Probe が Application 設計を歪めてはならない。runtime-dependent value に到達したら Probe Boundary として安全に止める。**
