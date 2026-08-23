# Loutre Architecture v0.1

> **状態:** Phase 1 アーキテクチャの FROZEN ベースライン  
> **日付:** 2026-08-23 (JST)  
> **プロジェクト / ブランド:** **Loutre** 🦦  
> **npm scope:** `@loutrefw/*`  
> **対象読者:** Loutre の初期実装を引き継ぐ Codex / 開発者

---

## 0. Codex 引き継ぎ指示

このドキュメントを **Loutre Phase 1 の source of truth** とする。

実装時は以下を守ること。

1. **FROZEN** と書かれた項目は提案ではなく要件として扱う。
2. **Superseded / Rejected** にある過去案を、明示的な設計変更なしに復活させない。
3. **OPEN / TODO** は意図的に未確定である。実装の都合だけで恒久的な Public API を固定しない。
4. runtime reflection や暗黙 convention より、**Compiler が解析可能な明示構造**を優先する。
5. Core は runtime-neutral に保つ。Node.js 固有 global/API を Core に持ち込まない。
6. TypeScript の通常の書き味を維持する。Loutre 独自言語のような DSL にしない。
7. 実装上の都合が FROZEN 設計と衝突した場合、Public API を勝手に変えず narrow abstraction boundary で止める。
8. Phase 1 は fixture-first で進め、複数 runtime で同じ fixture を conformance test する。
9. この文書内の `MUST` / `SHOULD` / `MAY` / `MUST NOT` は規範的な意味を持つ。

---

# 1. 概要

Loutre は、**明示的で静的解析可能な Application Graph** を中心に設計する TypeScript application/backend framework である。

中核思想は以下。

> **Loutre makes the application graph explicit, analyzable, and portable.**
>
> Loutre は Application Graph を明示し、解析可能にし、runtime 間で portable にする。

Loutre application は TypeScript source から Compiler により解析され、以下を含む Graph / IR に変換される。

- Module と Module Instance
- Provider / DI Token
- Contract / Procedure
- Protocol binding
- Protocol ごとの ordered Pipeline
- Pipeline 内の Layer
- Validation の位置
- Layer が require / provide する execution-scoped Token
- Lifecycle hook
- Env による条件分岐
- Runtime capability requirement
- Contract ↔ Controller / Resolver / Handler binding
- Controller 等の DI requirement

Compiler は runtime より前に Graph を検証し、runtime adapter が利用する Manifest を生成する。

Loutre は **Node-first ではない**。
Node.js / Bun / Deno / Cloudflare Workers(workerd) / AWS Lambda / Electron 等を、同じ application model から adapter 経由で動かす。

---

# 2. ブランドと namespace — FROZEN

- Framework 名: **Loutre**
- Framework 自体を「LoutreFW」とは呼ばない。
- npm organization / scope: **`@loutrefw/*`**
- 専用 domain は必須ではない。Momizicode 配下で問題ない。

例:

```text
@loutrefw/core
@loutrefw/compiler
@loutrefw/http
@loutrefw/runtime-node
@loutrefw/runtime-lambda
```

package 分割そのものは DRAFT だが、npm scope は FROZEN。

---

# 3. 設計原則 — FROZEN

## 3.1 Filesystem magic より Explicit Graph

Application 構造を filesystem convention から暗黙 discovery しない。

Module / Provider / Contract / Implementation / dependency は明示的に宣言する。

Filesystem helper を将来 tooling として追加することは MAY だが、source of truth にしてはならない。

## 3.2 Reflection-first ではなく Compiler-first

Runtime reflection を DI/Application Graph 構築の主手段にしない。

Compiler が TypeScript AST / type information と Loutre declaration を解析し、Graph/Manifest を生成する。

## 3.3 Contract-first

Public API / transport schema の source of truth は Contract。

Controller/Resolver は Contract の implementation であり、route/schema の定義元ではない。

## 3.4 Protocol-aware / Core-neutral

HTTP / GraphQL / WebSocket / MessagePort / Electron 等は、共通 application core に対する Protocol/Adapter として扱う。

Protocol 固有概念は Protocol 定義や Protocol Pipeline 内に置いてよいが、Domain Service にデフォルトで漏らさない。

## 3.5 実行順序はコード上で見える

Nest 的な固定レーン、例えば:

```text
Middleware → Guard → Interceptor → Handler
```

のように framework が順序を暗黙決定しない。

各 Protocol が **Pipeline** を持ち、Pipeline は **Layer** の ordered sequence とする。

## 3.6 Schema interoperability

Loutre 独自の Zod 風 schema DSL を作らない。

**Standard Schema** を共通 boundary とし、Zod / Valibot / ArkType 等を利用可能にする。

## 3.7 Capability-first portability

Runtime 機能を細粒度 Capability としてモデル化する。

Compiler / deployment tooling は Application requirement と Runtime capability を照合する。

---

# 4. Phase 1 scope — FROZEN

Phase 1 に含めるもの:

1. Explicit Module
2. Parameterized Module instance
3. Constructor DI
4. Arbitrary typed token
5. Class / Value / Factory / Conditional Provider
6. `application` / `execution` / `transient` scope
7. Standard Schema integration
8. Injectable typed Env
9. Env schema 由来の symbolic key
10. Contract / Procedure
11. Protocol-local ordered Pipeline
12. Layer execution model
13. HTTP Protocol
14. HTTP Validation Layer (`params/query/headers/body`)
15. Authentication Layer / Guard Layer
16. 任意 developer-defined Token の provide による refinement
17. Short circuit
18. Error normalization / Protocol finalization
19. Structured contextual Logger
20. Compiler Graph IR / static validation / Manifest
21. Runtime Capability
22. Runtime conformance suite
23. CLI / Graph inspection
24. Nest-like lifecycle semantics
25. Interaction IR として `unary / server-stream / client-stream / duplex` を考慮
26. Phase 1 実装として最低 `unary + server-stream`

---

# 5. 全体アーキテクチャ — FROZEN

```text
TypeScript Source
      │
      ▼
Loutre Compiler
      │
      ├── Module Graph
      ├── Provider / DI Graph
      ├── Contract / Procedure Graph
      ├── Protocol Graph
      ├── Pipeline Graph
      ├── Env Conditional Graph
      ├── Capability Requirement Graph
      ├── Lifecycle Graph
      └── Implementation Binding Graph
      │
      ▼
Loutre Graph IR
      │
      ├── static validation
      ├── diagnostics
      └── manifest generation
      │
      ▼
Runtime Adapter
      │
      ├── Node.js
      ├── Bun
      ├── Deno
      ├── workerd / Cloudflare Workers
      ├── AWS Lambda
      ├── Electron
      └── future adapters
```

Protocol input の処理概念:

```text
外部 Protocol Input
       │
       ▼
Protocol Decode             ← framework internal
       │
       ▼
Protocol Pipeline
  Layer.inbound
       ↓
  Layer.inbound
       ↓
  ...
       ↓
  Protocol Terminal
       │
       ▼
  Logical Result
       │
       ▼
  Layer.outbound
       ↑
  Layer.outbound
       │
       ▼
Error Mapping (必要時)
       │
       ▼
Protocol Finalization       ← framework internal
       ├── response/result variant check
       ├── output schema validation
       ├── status / metadata mapping
       └── serialization / stream adaptation
       │
       ▼
外部 Protocol Output
```

---

# 6. Module — FROZEN

## 6.1 Module は明示的な Parameterized Template

概念モデル:

```text
ModuleTemplate<Args>
       │ args
       ▼
ModuleInstance
```

すべての Module は概念上 Args を受け取る。
引数不要なら `ModuleTemplate<void>` と考える。

Public API の基準形:

```ts
export const DatabaseModule = defineModule<DatabaseModuleArgs>((args) => ({
  description: 'Database connection',
  imports: [],
  providers: [],
  implementations: [],
  exports: [],
  lifecycle: {},
}))
```

## 6.2 `@Module class` ではなく `defineModule()` — FROZEN

Phase 1 の Module 表現は class decorator ではなく、以下を採用する。

```ts
defineModule<Args>((args) => ModuleDefinition)
```

理由:

- Module は parameterized structural template である。
- 同一 Module の複数 instance が自然に表現できる。
- Args を Provider / Lifecycle / conditional definition に利用しやすい。
- Compiler が解析しやすい。
- Runtime state は基本 Provider が持つべきで、Module definition object 自体に持たせる必要がない。

## 6.3 同一 Module の複数 Instance を許可

```ts
export const PRIMARY_DB = token<Database>('database.primary')
export const ANALYTICS_DB = token<Database>('database.analytics')

export const AppModule = defineModule(() => ({
  imports: [
    DatabaseModule({
      provide: PRIMARY_DB,
      url: AppEnv.key('PRIMARY_DATABASE_URL'),
    }),

    DatabaseModule({
      provide: ANALYTICS_DB,
      url: AppEnv.key('ANALYTICS_DATABASE_URL'),
    }),
  ],
}))
```

Injectable resource の user-facing identity は基本 **Provider Token** が担う。

Compiler/runtime 内部では ModuleInstance identity を持ってよい。
ただし DB 接続を区別するためだけに user が module token を作らされる設計にはしない。

## 6.4 Module fields

Phase 1 Module definition は少なくとも以下を扱える設計にする。

```text
imports
providers
implementations
exports
description
lifecycle
requires / capability metadata
```

Capability metadata の exact property name は OPEN。
概念自体は FROZEN。

---

# 7. Dependency Injection — FROZEN

## 7.1 `@Injectable()` は不要

通常 class dependency は constructor から解析する。

```ts
export class UserService {
  constructor(
    private readonly users: UserRepository,
  ) {}
}
```

`@Injectable()` を必須にしない。

## 7.2 Arbitrary custom token は first-class

```ts
export const PRIMARY_DB = token<Database>('database.primary')
```

Optional metadata は MAY:

```ts
export const PRIMARY_DB = token<Database>('database.primary', {
  description: 'Primary application database',
})
```

Token は以下を持つべき。

- Compiler-visible な安定 identity
- Type information
- Graph/diagnostic 用の readable name
- optional description

## 7.3 Custom token には `@Inject(TOKEN)` を使う

```ts
export class UserRepository {
  constructor(
    @Inject(PRIMARY_DB)
    private readonly db: Database,
  ) {}
}
```

Parameter decorator を無理に排除することは設計目標ではない。

## 7.4 Provider API

Conceptual API:

```ts
provide(Token).useClass(Implementation)
provide(Token).useValue(value)
provide(Token).useFactory(...)
provide(Token).select(...)
```

```ts
providers: [UserService]
```

は self-binding class Provider の shorthand とみなす。

### Conditional Provider

```ts
provide(Storage).select(
  AppEnv.key('STORAGE_DRIVER'),
  {
    memory: MemoryStorage,
    s3: S3Storage,
  },
)
```

Env key の型が finite union の場合、Compiler は mapping exhaustiveness を検証 SHOULD。

## 7.5 Scope

Phase 1 の scope 名は FROZEN:

```text
application
execution
transient
```

HTTP 固有の `request` ではなく `execution` を使う。
WebSocket / MessagePort / Electron / Lambda 等でも同じ語彙を使えるため。

### Protocol Implementation の Scope

Controller / Resolver / Handler は **Phase 1 では execution-scoped**。

理由:

```text
Pipeline Layer
  └─ SESSION を provide
        ↓
terminal 到達
        ↓
Controller instantiate
        ↓
@Inject(SESSION)
```

Pipeline の途中で作られた execution-scoped Token を constructor DI できる必要がある。

Stateless Controller の application-scope 最適化は将来 MAY。
Phase 1 の基本挙動にはしない。

---

# 8. Env Model — FROZEN

Env は Standard Schema を使う injectable service。
Global mutable `env` は作らない。

```ts
const AppEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']),
  STORAGE_DRIVER: z.enum(['memory', 's3']),
  PRIMARY_DATABASE_URL: z.string(),
})

export class AppEnv extends defineEnv(AppEnvSchema) {}
```

Runtime code:

```ts
export class SomeService {
  constructor(private readonly env: AppEnv) {}

  run() {
    this.env.STORAGE_DRIVER
  }
}
```

## 8.1 Compiler-visible symbolic Env key

Actual secret/value を compile-time graph declaration に埋めない。

```ts
AppEnv.key('STORAGE_DRIVER')
```

この symbolic key は schema から型生成され、Graph output に安全に表示できる。

## 8.2 Conditional Graph

Compiler は可能な finite Env branch を conditional/supergraph として表現し、可能な範囲で全 branch を validation する。

Local machine の現在値だけで compile graph を確定しない。

Env/module graph variation と request/execution-specific context を混同しない。

---

# 9. Schema Model — FROZEN

Loutre は Standard Schema compatible schema を受け取る。

Framework 専用 schema language を要求しない。

Zod は example で使ってよいが、architecture 上特別扱いしない。

---

# 10. Contract / Procedure / Protocol — FROZEN

## 10.1 Contract-first

Contract が public protocol schema と procedure name の source of truth。

```ts
export const UsersContract = contract({
  get: procedure({
    protocols: {
      http: http({ /* ... */ }),
    },
  }),
})
```

`@Get()` / `@Post()` のような route decorator は Phase 1 の source of truth にしない。

## 10.2 Top-level `success` / `errors` / `output` sugar は作らない

以下は REJECTED:

```ts
procedure({
  output: ...,
  success: ...,
  errors: ...,
})
```

Wire semantics は Protocol 内に置く。

## 10.3 Protocol ごとに異なる wire model を持てる

同じ domain operation を以下へ公開してよい。

```text
HTTP
GraphQL
WebSocket
MessagePort
Electron
future protocols
```

各 Protocol が自身の transport semantics を所有する。

## 10.4 Interaction Mode

IR は最低以下を表現できるようにする。

```text
unary
server-stream
client-stream
duplex
```

Phase 1 implementation requirement:

```text
unary
server-stream
```

Core handler model を `Request -> Response` だけに固定しない。

---

# 11. HTTP Protocol — FROZEN core shape

```ts
procedure({
  protocols: {
    http: http({
      method: 'PATCH',
      path: '/articles/{id}',

      input: {
        params: ArticleParamsSchema,
        query: UpdateQuerySchema,
        headers: RequestHeadersSchema,
        body: UpdateArticleSchema,
      },

      responses: {
        updated: {
          status: 200,
          body: ArticleSchema,
        },

        notFound: {
          status: 404,
          body: NotFoundSchema,
          error: ArticleNotFound,
        },
      },

      pipeline: [
        // Layers...
        http.controller,
      ],
    }),
  },
})
```

## 11.1 Named response variants

複数 success/failure が異なる status/schema を持てるため、HTTP response は named variant とする。

```ts
responses: {
  created: {
    status: 201,
    body: UserSchema,
  },

  updated: {
    status: 200,
    body: UserSchema,
  },

  notFound: {
    status: 404,
    body: UserNotFoundSchema,
    error: UserNotFound,
  },
}
```

Domain Error 自体に HTTP status を埋め込まない。

## 11.2 Protocol Decode は内部処理

User-visible な `protocolDecode` Layer token は作らない。

HTTP Adapter が Pipeline 入場前に必要な Protocol structure を decode する。

## 11.3 Protocol Finalization は内部処理

User は Pipeline に以下を書かない。

```text
outputValidation
protocolEncode
responseSerialization
```

Terminal と outbound unwind 後、framework が自動実行する。

---

# 12. Pipeline / Layer 用語 — FROZEN

> **Pipeline** = 1つの Protocol binding に対する ordered execution sequence  
> **Layer** = Pipeline 内の1つの executable unit

Array property 名は `layers` ではなく **`pipeline`**。

```ts
pipeline: [
  accessLogging,
  validate.headers,
  bearerAuthentication,
  validate.params,
  authenticated,
  validate.body,
  tracing,
  http.controller,
]
```

上から書いた順が inbound execution order と一致 MUST。

---

# 13. Layer — FROZEN semantics

## 13.1 基本形

Conceptual shape:

```ts
layer({
  inbound(ctx) {
    // ...
  },

  outbound(ctx, outcome, state) {
    // ...
  },
})
```

Factory signature は OPEN。
`inbound` / `outbound` の名称と意味は FROZEN。

## 13.2 Execution order

Pipeline:

```text
A
B
C
terminal
```

Execution:

```text
A.inbound
B.inbound
C.inbound
terminal
C.outbound
B.outbound
A.outbound
```

FILO stack unwind。

Outbound hook を持たない Layer は unwind 時に何もしない。

## 13.3 Entered Layer rule

`inbound` が正常完了した Layer のみ entered とみなし、outbound を呼ぶ。

`B.inbound` 自体が throw した場合:

```text
A.inbound ✓
B.inbound ✗ throw
B.outbound は呼ばない
A.outbound(error) は呼ぶ
```

## 13.4 Outcome

Conceptual type:

```ts
type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }
```

Exact public type name は OPEN。

## 13.5 Generic Layer に arbitrary error recovery を持たせない

Generic Layer を万能 error rewrite middleware にしない。

Error normalization / mapping は Application / Protocol responsibility とする。

## 13.6 Layer Role

実行機構は Layer に統一するが、semantic role は Compiler/Graph に残す。

```text
generic
authentication
guard
validation
framework
terminal
```

`layer()` / `authentication()` / `guard()` 等の exact factory name は OPEN。
Role metadata 概念は FROZEN。

---

# 14. HTTP Validation Layer — FROZEN

Input validation は HTTP input category ごとに分割する。

予約 namespace/token:

```ts
validate.params
validate.query
validate.headers
validate.body
```

`headers` は複数形で FROZEN。

```ts
pipeline: [
  accessLogging,

  validate.headers,
  bearerAuthentication,

  validate.params,
  authenticated,
  canEditArticle,

  validate.query,
  validate.body,

  http.controller,
]
```

Compiler は型が段階的に強くなることを理解する。

```text
start:
  params   unknown
  query    unknown
  headers  unknown
  body     unknown

validate.headers:
  headers  RequestHeaders

validate.params:
  params   ArticleParams

validate.body:
  body     UpdateArticleInput
```

Validated params を必要とする Layer を `validate.params` より前に置いたら compile error。

## 14.1 Streaming Body も `validate.body` を使う

Streaming Body を特別に除外しない。

`validate.body` は **「必ず全量 consume / buffer する」意味ではない**。

JSON:

```text
Raw Body Stream
   ↓ validate.body
Parse + Validate
   ↓
Typed Value
```

Streaming upload:

```text
Raw Body Stream
   ↓ validate.body
Validating / Transform Stream
   ↓
Controller が必要に応じて consume
```

Pipeline 内で body を都度通すこと自体は問題ない。
重要なのは one-shot stream を複数 Layer が勝手に重複消費しないこと。

Implementation は stream ownership / backpressure を正しく扱う MUST。

## 14.2 OPEN: Validation omission policy

未確定:

- Schema が存在する場合、対応する `validate.*` token を必須にするか。
- Docs/client generation 用 schema は宣言するが server validation を明示的に skip できるか。
- Missing validation を error / warning / explicit opt-out のどれにするか。

User approval なしに恒久仕様を決めない。

---

# 15. Authentication / Guard / Arbitrary Refinement — FROZEN

Loutre は `Auth` shape を framework 固定しない。

例えば以下だけを前提にしない。

```ts
{ user: User | null }
→
{ user: User }
```

Application ごとに必要な execution data は異なる。

一般化した仕組み:

> **Layer は既存 Token を require/inject し、新しい execution-scoped Token を provide できる。**

これを型 refinement の一般機構とする。

例:

```ts
interface AuthState {
  user: User | null
}

export const AUTH = token<AuthState>('auth')
```

Authentication Layer:

```text
bearerAuthentication
  provides AUTH
```

Application-defined stronger token:

```ts
interface AuthenticatedSession {
  user: User
}

export const SESSION = token<AuthenticatedSession>('session')
```

Guard:

```text
authenticated
  requires AUTH
  provides SESSION
```

さらに:

```text
tenantAccess
  requires SESSION
  requires validated params
  provides CURRENT_TENANT
  provides TENANT_PERMISSIONS
```

Developer は任意の型を define できる。

例:

```text
CurrentTenant
LoadedArticle
AdminPrincipal
FeatureAvailability
ValidatedLicense
ResolvedWorkspace
PermissionSet
```

Framework は generic Token/Provider mechanism のみ提供し、application shape を決めない。

## 15.1 Compiler Validation

Invalid:

```text
1 authenticated
   requires AUTH   ← unavailable

2 bearerAuthentication
   provides AUTH

3 http.controller
```

Compiler は「必要 Token が後段で provide されている」ことまで含めて path-aware diagnostic を出す SHOULD。

---

# 16. Short Circuit — FROZEN concept

Layer は残りの inbound と terminal invocation を打ち切り、Logical Result を返せる。

Conceptual API:

```ts
return shortCircuit(result)
```

Exact API は OPEN。

Semantics:

1. 残りの inbound Layer を skip
2. Protocol terminal を skip
3. 既に entered な Layer を reverse outbound で unwind
4. Logical Result は必ず Protocol Finalization を通る

```text
accessLog.inbound
idempotency.inbound
  └─ shortCircuit(created(existing))

idempotency.outbound
accessLog.outbound

HTTP Finalization
  ├─ created response schema validation
  ├─ status 201
  └─ serialization
```

Security のために Loutre が Layer を勝手に reorder してはいけない MUST NOT。

ただし suspicious order を warning することは MAY。
例: authentication より前に short-circuit cache がある。

---

# 17. Protocol Terminal — FROZEN

各 Protocol Pipeline は **ちょうど1つの Protocol-specific Terminal** で終わる。

Terminal は Pipeline の最後 MUST。
Terminal の後ろに user Layer を置いてはならない。

FROZEN 名:

```ts
http.controller
graphql.resolver
websocket.handler
messagePort.handler
```

Compiler IR 内部では共通して `TerminalLayer` と呼んでよい。

Valid:

```ts
pipeline: [
  validate.params,
  authenticated,
  http.controller,
]
```

Invalid:

```ts
pipeline: [
  http.controller,
  tracing,
]
```

---

# 18. Pipeline の配置 — FROZEN

Pipeline は Procedure root ではなく、**各 Protocol definition の中**に置く。

```ts
procedure({
  protocols: {
    http: http({
      pipeline: [
        validate.headers,
        bearerAuthentication,
        http.controller,
      ],
    }),

    messagePort: messagePort({
      pipeline: [
        desktopSession,
        messagePort.handler,
      ],
    }),
  },
})
```

理由:

- Validation 対象が Protocol ごとに異なる。
- Authentication 方法が異なる。
- Context が異なる。
- Terminal type が異なる。
- 同じ Procedure でも HTTP と Electron で execution pipeline が別物になりうる。

---

# 19. Controller / Resolver Typing — FROZEN

## 19.1 TypeScript 方式A: 普通の class method を使う

Primary syntax は callback/class field 方式ではなく **normal prototype method**。

```ts
type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

export class UsersController implements UsersHttp {
  constructor(
    private readonly users: UsersService,
  ) {}

  async get(
    ctx: ContextOf<UsersHttp, 'get'>,
  ) {
    const user = await this.users.find(ctx.params.id)

    if (!user) {
      throw UserNotFound({ id: ctx.params.id })
    }

    return ctx.response.found(user)
  }
}
```

理由:

- 普通の TypeScript class/prototype method
- AST が単純
- inheritance / `super` と相性がよい
- instance ごとの function field を避けられる
- Loutre 専用 handler callback DSL を primary にしない

TypeScript の `implements` は compatibility check はするが、method parameter type を contextual inference してくれない。
そのため `ContextOf<...>` は明示する。

## 19.2 過去案の訂正

以下は FROZEN API ではない。

```ts
type Users = ControllerOf<typeof UsersContract>
Users.Context<'get'>
```

Type alias に namespace-like member をそのまま生やすことはできない。

FROZEN direction:

```ts
ControllerOf<...>
ContextOf<...>
```

Generic parameter の exact ordering/name は実装時に調整 MAY。
Semantics は変えない。

---

# 20. Contract ↔ Implementation Binding — FROZEN

Contract は implementation を知らない。

Controller/Resolver/Handler は TypeScript type level で Contract を知る。

**Module が binding を所有する。**

基準 Public API:

```ts
export const UsersModule = defineModule(() => ({
  providers: [
    UsersService,
    UsersRepository,
  ],

  implementations: [
    implement(UsersContract)
      .for(http)
      .with(UsersController),
  ],
}))
```

## 20.1 Fundamental Binding Identity

Compiler 上の基本 mapping:

```text
Contract × Procedure × Protocol → Implementation Method
```

Public/enabled binding には実装が **ちょうど1つ**必要。

## 20.2 1 Contract を複数 Controller に分割可能

```ts
implementations: [
  implement(UsersContract)
    .for(http)
    .procedures('get', 'list')
    .with(UserQueryController),

  implement(UsersContract)
    .for(http)
    .procedures('create', 'update', 'delete')
    .with(UserCommandController),
]
```

Type utility も procedure subset を表現可能にする。

```ts
type UserQueriesHttp = ControllerOf<
  typeof UsersContract,
  'http',
  'get' | 'list'
>
```

Generic ordering は implementation detail。
機能自体は FROZEN。

## 20.3 1 Implementation class が複数 Contract を実装してよい

```ts
implement(AccountContract).for(http).with(AccountController)
implement(ProfileContract).for(http).with(AccountController)
```

Method name が incompatible collision する場合、Phase 1 は alias/mapping sugar を追加せず class 分割を要求する。

## 20.4 Protocol-specific implementation を推奨

```ts
implementations: [
  implement(UsersContract)
    .for(http)
    .with(UsersController),

  implement(UsersContract)
    .for(graphql)
    .with(UsersResolver),
]
```

HTTP Context と GraphQL Context は semantics が異なる。
Domain Service を下層で共有する。

## 20.5 Coverage Diagnostics

Compiler MUST detect:

- missing implementation coverage
- duplicate coverage
- implementation type mismatch
- terminal/protocol mismatch
- terminal 到達時に unavailable な execution-scoped constructor DI token

例:

```text
LUTRE_IMPL_001

UsersContract の HTTP 実装が不完全です。

Implemented:
  ✓ get

Missing:
  ✗ list
  ✗ create
```

---

# 21. Protocol Finalization / Result Model — FROZEN concept

Terminal 実行と outbound unwind が終わった時点の値は、wire object ではなく **Logical Protocol Result**。

HTTP の例:

```text
variant = created
value   = User
```

HTTP Finalizer:

1. declared response variant を特定
2. body/output schema を validate
3. HTTP status/header を決定
4. value/stream を serialize/adapt
5. runtime HTTP response を生成

これらを Pipeline に書かせない。

## 21.1 OPEN: Response helper syntax

候補:

```ts
return ctx.response.created(user)
```

Named response variant が static check されることは FROZEN。
Helper syntax 自体は OPEN。

---

# 22. Error Model — FROZEN concept

JavaScript/TypeScript の `throw` を禁止しない。
Framework boundary の通常手段として扱う。

```text
throw
  ↓
entered Layer outbound が failure Outcome を観測
  ↓
Application Error Handler
  ↓
Normalized Application Error
  ↓
Protocol-specific Error Mapping
  ↓
Declared Protocol Result / Response Variant
  ↓
Protocol Finalization
```

## 22.1 Domain Error は Protocol-neutral

```ts
export const UserNotFound = defineError({
  code: 'USER_NOT_FOUND',
  data: z.object({
    userId: z.string(),
  }),
})
```

HTTP status は HTTP protocol 側:

```ts
notFound: {
  status: 404,
  body: UserNotFoundSchema,
  error: UserNotFound,
}
```

Domain Error に 404 を持たせない。

## 22.2 Unknown Error

Unknown error は client に安全な internal error へ正規化し、内部には以下を保持 SHOULD。

```text
errorId
stack
cause
module
provider/service
procedure
executionId / requestId
traceId
```

## 22.3 OPEN

- exact `defineError()` API
- Application Error Handler registration
- Protocol Error Handler registration
- Normalized Error extensibility
- outbound Layer が result/error を transform 可能か、observation/cleanup-only か

Responsibility boundary は FROZEN。

---

# 23. Lifecycle — FROZEN semantics / syntax 部分 OPEN

Nest-like lifecycle naming/meaning を踏襲する。

```text
onModuleInit
onApplicationBootstrap

onModuleDestroy
beforeApplicationShutdown
onApplicationShutdown
```

## 23.1 Provider Lifecycle

Runtime resource は基本 Provider class が lifecycle を所有する。

```ts
export class Database
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.connect()
  }

  async onModuleDestroy() {
    await this.close()
  }
}
```

## 23.2 Declarative Module Lifecycle

Module coordination hook は declarative に定義可能。
Compiler-visible であり、ModuleInstance provider を inject できる。

```ts
export const DatabaseModule = defineModule<DatabaseModuleArgs>((args) => ({
  providers: [/* ... */],

  lifecycle: {
    onModuleInit: hook({
      inject: [args.provide, Logger],

      async run(db, logger) {
        await db.verifySchema()
        logger.info('Database ready')
      },
    }),
  },
}))
```

Exact `hook()` syntax は OPEN。

## 23.3 Serverless Shutdown

Shutdown hook が全 runtime/serverless で確実に実行されると仮定してはいけない。

Capability 例:

```text
runtime.shutdownHook
```

Execution-scoped object は application lifecycle resource ではない。

---

# 24. Logger — FROZEN

Phase 1 から structured contextual Logger を含める。

```ts
export class UserService {
  constructor(
    private readonly logger: Logger,
  ) {}
}
```

以下は不要:

```ts
new Logger(UserService.name)
```

DI / Compiler / Runtime が自動 context を付与する。

候補 metadata:

```text
module
provider/service
procedure
protocol
executionId / requestId
traceId
```

例:

```json
{
  "level": "info",
  "message": "Creating user",
  "module": "UsersModule",
  "source": "UsersService",
  "procedure": "users.create",
  "requestId": "req_xxx",
  "traceId": "..."
}
```

Phase 1 は console backend で十分。
OpenTelemetry/backend adapter は後から追加可能。

---

# 25. Compiler — FROZEN

Compiler は Phase 1 core feature。
後回しの optimization ではない。

```text
TypeScript AST / Type Info
   ↓
Module Graph
Provider Graph
Contract Graph
Protocol Graph
Pipeline Graph
Env Condition Graph
Capability Graph
Lifecycle Graph
Implementation Binding Graph
   ↓
Loutre IR
   ↓
Validation
   ↓
Manifest
   ↓
Runtime
```

## 25.1 Compiler Responsibilities

最低以下を理解する。

- `defineModule()` template / instance
- Module imports / exports
- Provider binding
- Custom token
- Constructor DI
- Scope
- Env symbolic key
- Conditional provider
- Contract / Procedure
- Protocol definition
- Response/message schema
- Pipeline order
- Layer role
- Validation position
- Layer `requires` / `provides`
- Terminal placement
- Implementation coverage
- Controller/Resolver constructor requirement
- Lifecycle dependency/order
- Runtime Capability requirement

## 25.2 Static Diagnostics

### Token が未提供

```text
Pipeline:
1 authenticated
   requires AUTH      ← error
2 bearerAuthentication
   provides AUTH
```

### Validation order

```text
canEditArticle requires validated params
but validate.params appears later.
```

### Terminal placement

```text
http.controller must be the final Pipeline item.
```

### Controller DI vs Pipeline

```text
AccountController requires SESSION,
but SESSION is not available when http.controller is reached.
```

Diagnostic は dependency/path を含む actionable なものにする。

## 25.3 Conditional Graph

Finite Env branch は可能な限りすべて validate し、developer の current env だけを検証して終わらない。

---

# 26. Runtime Capability Model — FROZEN concept

Phase 1 から atomic/fine-grained にする。

初期 registry 候補:

```text
http.server
http.client
http.request.streaming
http.response.streaming

websocket.server
websocket.client

stream.readable
stream.writable
stream.transform

messagePort.send
messagePort.receive
messagePort.transfer

tcp.client
tcp.server

udp.client
udp.server

filesystem.read
filesystem.write
filesystem.watch

crypto.random
crypto.digest
crypto.subtle

worker.spawn

background.waitUntil

runtime.longLived
runtime.shutdownHook

env.runtime
```

Capability name normalization は実装中に調整 MAY。
Atomic model 自体は FROZEN。

```text
MissingCapabilities
  = ApplicationRequirements - RuntimeCapabilities
```

Requirement 欠落時、deployment/check は失敗させる。

`loutre doctor` は mismatch 理由を説明 SHOULD。

---

# 27. Runtime Portability / Conformance — FROZEN

## 27.1 Version Policy

Runtime target の version 方針:

1. **Node.js は user 指定により 26.x を基準とする。**
2. LTS channel を公式に持つ runtime は **最新 LTS** を基準とする。
3. LTS 制度がない runtime は **最新 Stable** を基準とする。
4. Cloudflare Workers/workerd は package version ではなく **最新 compatibility date** を基準に conformance test する。
5. Managed platform が Node 26 をまだ提供していない場合、その platform の **最新 supported managed runtime** を使い、Node 26 対応後に追従する。

重要:

- 2026-08-23 時点の Node.js 26.x は **Current** で、LTS 入りは 2026-10 予定。
- それでも Loutre の primary Node runtime baseline は **Node.js 26.x** とする。

## 27.2 2026-08-23 時点の Phase 1 Conformance Matrix

| Target | Baseline | Policy | Phase 1 |
|---|---|---|---:|
| Node.js | **26.x** | user 指定。Current でも採用 | ✅ |
| Bun | **1.4.x** | LTS制度なし → 最新Stable | ✅ |
| Deno | **2.9.x LTS** | 最新LTS channel | ✅ |
| Cloudflare Workers / workerd | **最新 compatibility date** | evergreen runtime | ✅ |
| Electron main | **43.x** | LTS制度なし → 最新Stable major | ✅ |
| Electron renderer / MessagePort | **43.x** | Electron stable に追従 | ✅ |
| AWS Lambda managed Node.js | **24.x (`nodejs24.x`)** | 現在の最新 managed runtime | ✅ |

### AWS Lambda Node.js 26 について

2026-08-23 時点では AWS Lambda managed runtime の Node.js 26 はまだ提供されていない。
AWS の公開予定は **2026-11**。

したがって Phase 1 では:

```text
Generic Node Adapter / Local Node Conformance
  → Node.js 26.x

AWS Lambda Managed Adapter
  → nodejs24.x

AWS が nodejs26.x を公開後
  → Lambda conformance baseline を Node.js 26 に更新
```

Custom runtime/container で Node 26 を動かす余地はあるが、Phase 1 の managed Lambda conformance baseline は現行公式 managed runtime を優先する。

## 27.3 Deno

2026-08-23 時点の LTS channel は **Deno 2.9**。
Conformance は 2.9.x LTS の最新 patch を使用する。

## 27.4 Bun

Bun は Node/Deno 型の LTS channel を前提としないため、Phase 1 baseline は **最新 Stable 1.4.x**。
CI では supported range をむやみに固定せず、最新 Stable への追従テストを行う。

## 27.5 Electron

Electron は LTS ではなく active stable majors を更新する model。
2026-08-23 時点の最新 Stable は **Electron 43.x**。

Phase 1 baseline:

```text
Electron main       43.x
Electron renderer   43.x
MessagePort         43.x environment
```

## 27.6 Cloudflare Workers / workerd

workerd は通常の LTS major pin ではなく evergreen runtime + `compatibility_date` model。

Loutre conformance では:

- CI 実行時の最新 compatibility date を利用 SHOULD
- v0.1 の最低 baseline は **2026-08-04 以降**
- Core は Cloudflare の Node compatibility layer に依存しない設計を維持する
- Adapter 側は Workers capability を明示的に宣言する

## 27.7 Adapter responsibility

Runtime-specific handler/streaming difference は Adapter が吸収する。
Application/Domain code を runtime target ごとに書き換えない。

```text
Application server-stream result
         │
         ├── Node HTTP/Web Stream
         ├── Bun Stream
         ├── Deno Web Stream
         ├── Cloudflare Response Stream
         ├── Lambda Response Streaming Adapter
         └── Electron MessagePort messages
```

Vercel / Netlify は future deployment adapter candidate。
v0.1 conformance target には含めない。

---

# 28. CLI / Inspection — FROZEN intent

Phase 1 commands:

```text
loutre dev
loutre build
loutre start

loutre check
loutre doctor

loutre graph modules
loutre graph di
loutre graph contracts
loutre graph runtime

loutre explain <target>
```

Phase 1 output は terminal text でよい。

将来 MAY:

```text
JSON
DOT
GUI DevTools
```

Env secret value は graph output に出さない。
Symbolic key のみ表示する。

Execution graph 例:

```text
UsersContract.update [http]

1 accessLogging             generic
2 validate.headers          validation
3 bearerAuthentication      authentication
   └─ provides AUTH
4 validate.params           validation
5 authenticated             guard
   ├─ requires AUTH
   └─ provides SESSION
6 canEditArticle            guard
   ├─ requires validated params
   └─ provides CURRENT_ARTICLE
7 validate.body             validation
8 http.controller           terminal
   └─ UsersController.update
```

---

# 29. Canonical Phase 1 Fixtures — FROZEN Acceptance Suite

実装は最低この4 fixture を基準に進める。

## Fixture A — 普通の HTTP CRUD

検証対象:

- Contract-first
- params/body schema
- `validate.params`
- `validate.body`
- named response variant
- `http.controller`
- `ControllerOf` / `ContextOf`
- Module implementation binding
- normal Provider DI

概念:

```text
GET  /users/{id}
POST /users
```

## Fixture B — Bearer Auth + Guard + Arbitrary Execution State

検証対象:

- `validate.headers`
- Authentication Layer
- Guard Layer
- developer-defined Token
- `requires` / `provides`
- execution-scoped DI
- Controller instantiate at terminal
- invalid Pipeline order diagnostic

例:

```text
bearerAuthentication
  provides AUTH

authenticated
  requires AUTH
  provides SESSION

tenantAccess
  requires SESSION
  provides CURRENT_TENANT
```

この fixture は **Pipeline Graph と execution-scoped DI が実体を伴うことの証明**。

## Fixture C — DatabaseModule 2 Instance + Lifecycle

検証対象:

```text
DatabaseModule(PRIMARY_DB)
DatabaseModule(ANALYTICS_DB)
```

- parameterized module
- same module multiple instances
- custom token
- Env symbolic key
- Provider lifecycle
- declarative Module lifecycle
- Graph display

## Fixture D — HTTP Server Stream + MessagePort/Electron + Lambda

同じ domain/service stream を異なる Protocol/Runtime で公開する。

検証対象:

- server-stream IR
- HTTP SSE / streaming response
- MessagePort/Electron
- Protocol-specific Pipeline
- Protocol-specific terminal
- Runtime capability
- Node 26 / Deno LTS / Bun stable / workerd / Electron / Lambda adapter differences

Domain Service は Protocol を知らない。

---

# 30. 推奨実装順 — FROZEN handoff plan

## Stage 0 — Repository Skeleton

- Monorepo setup
- TypeScript config
- Test runner
- Runtime conformance test harness skeleton
- Fixture directories

Node toolchain baseline は **Node.js 26.x**。

## Stage 1 — Core Types

最初に shape を作る:

```text
token<T>()
@Inject()
defineModule()
provide()
defineEnv()
contract()
procedure()
http()
Layer descriptor
validate.params/query/headers/body
http.controller
ControllerOf
ContextOf
implement(...).for(...).procedures(...).with(...)
```

この段階では runtime 完成不要。

## Stage 2 — Module + DI Runtime

- ModuleTemplate → ModuleInstance
- imports/exports
- Provider resolution
- custom token
- application/execution/transient scope
- contextual Provider
- Controller execution-scope instantiate

## Stage 3 — Compiler Graph IR

- AST/type analysis
- Module Graph
- Provider Graph
- Contract/Protocol Graph
- Pipeline Graph
- Implementation Binding Graph
- basic diagnostic
- Manifest shape

## Stage 4 — Pipeline Engine

- inbound
- entered Layer tracking
- terminal
- outbound unwind
- Outcome
- short circuit
- Layer requires/provides runtime context

## Stage 5 — HTTP

- HTTP descriptor
- protocol decode internal path
- validation tokens
- HTTP terminal
- Controller invocation
- logical response variant
- output validation
- protocol finalization
- unary
- server-stream

## Stage 6 — Env / Conditions / Lifecycle / Capability

- Standard Schema Env
- `Env.key()`
- conditional Provider graph
- lifecycle ordering
- Capability registry
- `doctor` foundation

## Stage 7 — Runtime Adapters / Conformance

優先順:

1. Node.js 26.x
2. Deno 2.9 LTS
3. Bun 1.4 stable
4. Cloudflare/workerd
5. Electron 43 main / renderer
6. AWS Lambda `nodejs24.x` managed runtime

Lambda `nodejs26.x` 公開後に conformance target を更新する。

## Stage 8 — CLI / Graph Tooling

```text
check
doctor
graph modules
graph di
graph contracts
graph runtime
explain
```

---

# 31. Superseded / Rejected Decisions — 勝手に復活させない

## 31.1 Filesystem convention-first discovery — REJECTED

Application structure は explicit Module/Graph。

## 31.2 `@Injectable()` requirement — REJECTED

普通の class constructor を Compiler が解析する。

## 31.3 `@Inject(TOKEN)` を完全排除 — REJECTED

Custom token では普通に使用する。

## 31.4 Global `env` — REJECTED

Env は injectable service。

## 31.5 Route decorator を API source of truth にする — REJECTED

Contract-first。

## 31.6 Top-level `output/success/errors` sugar — REJECTED

Protocol 内に response/message semantics を書く。

## 31.7 Fixed Middleware → Auth → Guard → Interceptor lane — REJECTED

Ordered Pipeline + Layer に統一。

## 31.8 Pipeline array 名 `layers` — SUPERSEDED

Property 名は `pipeline`。

## 31.9 Core execution primitive を `middleware` と呼ぶ — SUPERSEDED

基本単位は `Layer`。
全体は `Pipeline`。

## 31.10 Express-style `next()` callback — REJECTED

Inbound/outbound stack model を使う。

## 31.11 User-visible `protocolDecode` token — REJECTED

Protocol decode は Adapter/framework internal。

## 31.12 User-visible `outputValidation` / `protocolEncode` Layer — REJECTED

Protocol Finalization として internal 実行。

## 31.13 単一 `layer.inputValidation` — SUPERSEDED

HTTP は:

```text
validate.params
validate.query
validate.headers
validate.body
```

## 31.14 Streaming body は `validate.body` 不可 — REJECTED

Stream を consume し切らず、transform/validation stream として次へ渡せる。

## 31.15 Pipeline を Procedure root に置く — SUPERSEDED

各 Protocol 内に置く。

## 31.16 全 Protocol 共通 terminal `handler` — SUPERSEDED

```text
http.controller
graphql.resolver
websocket.handler
messagePort.handler
```

## 31.17 `httpLayer.controller` — NOT CHOSEN

`http.controller` を使う。
Pipeline 内なので Layer であることは明らか。

## 31.18 Primary Controller syntax を callback (`users.handler(...)`) にする — NOT CHOSEN

Normal class method + explicit Contract-derived Context type を採用。

## 31.19 `type Users = ...; Users.Context<'get'>` pseudo namespace — INVALID / SUPERSEDED

Standalone utility:

```text
ControllerOf
ContextOf
```

を使う。

## 31.20 Auth-specific refinement primitive — REJECTED

Generic `requires/provides` + arbitrary typed execution Token にする。

## 31.21 Node-first architecture — REJECTED

Cross-runtime portability は Phase 1 requirement。

## 31.22 `@Module class` を primary にする — SUPERSEDED

`defineModule<Args>()`。

## 31.23 Cache を built-in generic Layer policy に固定 — NOT ASSUMED

Cache の場所は semantic で決まる。

```text
HTTP response cache
  → protocol/CDN

Procedure result cache
  → procedure/application layer

Domain cache
  → service

DB query cache
  → repository/ORM

External API cache
  → client/service
```

万能 Cache Layer に押し込まない。

## 31.24 Middleware という考え方を Public Model の中心にする — SUPERSEDED

Layer / Pipeline model に置き換え済み。

## 31.25 Output side の Layer token を Pipeline に明示する — REJECTED

Pipeline は Protocol terminal で終わる。
Outbound は entered Layer を reverse に辿る。
Output validation/encode は Finalization。

---

# 32. OPEN / TODO — v0.1 実装で未確定

以下は会話で完全には決めていない。
見えない TODO にしないこと。

## 32.1 Public API Exactness

- [ ] `ControllerOf` / `ContextOf` の exact generic shape
- [ ] `contract()` / `procedure()` builder signature
- [ ] Layer factory signature
- [ ] Authentication/Guard role factory の exact API
- [ ] `requires` / `provides` declaration syntax
- [ ] `shortCircuit(...)` exact API
- [ ] `ctx.response.created(...)` 等 response helper exact API
- [ ] `defineError()` exact syntax
- [ ] Application Error Handler registration API
- [ ] Protocol Error Handler registration API
- [ ] Lifecycle `hook()` exact syntax

## 32.2 Validation

- [ ] Schema 宣言時に対応 `validate.*` を必須にするか
- [ ] Validation を intentional skip する explicit opt-out を許すか
- [ ] Cookies をどう扱うか
- [ ] Multipart/form-data をどう扱うか
- [ ] File input をどう扱うか
- [ ] Raw body をどう扱うか
- [ ] Reserved validation namespace を無限に増やさず extensible にする方法
- [ ] Streaming validation の backpressure / ownership invariant

## 32.3 Layer / Outbound Semantics

- [ ] outbound が Logical Result を replace/transform できるか
- [ ] observation / cleanup / transaction commit/rollback のみに制限するか
- [ ] outbound 自体が throw した場合の cleanup rule
- [ ] cancellation / abort propagation

## 32.4 HTTP Details

- [ ] header normalization semantics
- [ ] duplicate headers
- [ ] query array/object representation
- [ ] path param decoding rule
- [ ] body parser selection API
- [ ] response header definition shape
- [ ] SSE exact helper/schema shape

## 32.5 HTTP 以外の Protocol

- [ ] GraphQL schema shape
- [ ] GraphQL validation token naming
- [ ] WebSocket message/procedure shape
- [ ] MessagePort/Electron message shape
- [ ] 非HTTP Protocol の validation token naming
- [ ] Stream/message variant mapping

## 32.6 Application-level Interception

Protocol Pipeline は routing 後の procedure/protocol-local execution を表す。

未確定:

- [ ] route 未一致 404 等を含む access logging をどこで行うか
- [ ] Application/Adapter-level outer Pipeline/Layer を持つか
- [ ] それを Protocol Pipeline と同じ Layer model にするか、別 hook concept にするか

## 32.7 Compiler

- [ ] TypeScript Compiler API を直接使うか、別 AST front-end + TS type info にするか
- [ ] Graph IR schema
- [ ] Graph IR versioning
- [ ] Diagnostic code namespace
- [ ] Manifest serialization format
- [ ] `defineModule()` 内の arbitrary TypeScript をどこまで static evaluate するか
- [ ] Symbolic expression representation
- [ ] Incremental/watch compile strategy

## 32.8 DI / Scope

- [ ] Factory Provider exact syntax
- [ ] `.select()` exact syntax
- [ ] finite union exhaustiveness rule
- [ ] Circular dependency policy
- [ ] Lazy Provider/reference を持つか
- [ ] Long-lived WebSocket/duplex の `execution` scope ownership
- [ ] Execution cleanup timing

## 32.9 Module Graph

- [ ] Conditional import/export syntax が本当に必要か
- [ ] Explicit ModuleInstance name/key が必要になる real use case
- [ ] Implementation class の export visibility
- [ ] Module description metadata の exact shape

## 32.10 Lifecycle

- [ ] Independent module subgraph の parallel init ordering
- [ ] Lifecycle hook failure policy
- [ ] Shutdown timeout
- [ ] Shutdown cancellation
- [ ] Lambda/workerd 等 shutdown hook 非保証 runtime の扱い

## 32.11 Logger / Observability

- [ ] Stable context field name
- [ ] Trace/span integration
- [ ] OpenTelemetry adapter timing
- [ ] Logger が class/token/internal contextual provider のどれとして表面化するか

## 32.12 Runtime / Conformance

- [ ] Node.js 26 minor/patch pin policy
- [ ] Bun latest Stable 自動追従 strategy
- [ ] Deno 2.9 LTS latest patch strategy
- [ ] workerd `compatibility_date` update strategy
- [ ] Electron stable major 更新 strategy
- [ ] AWS Lambda `nodejs26.x` 公開後の migration
- [ ] Runtime feature matrix の自動生成

## 32.13 CLI / Package / Repository

- [ ] 初期 package split
- [ ] Config file が必要か
- [ ] Config file name/format
- [ ] Dev server
- [ ] Build/watch implementation
- [ ] JSON graph export
- [ ] DOT graph export
- [ ] CLI diagnostics UX

---

# 33. Phase 1 Non-goals

Fixture に必要でない限り、Phase 1 で以下へ scope を広げない。

- Full ORM
- Standard Schema と競合する独自 schema language
- Full authentication product
- Universal cache abstraction
- GUI DevTools 完成版
- 全 frontend framework 向け codegen
- Filesystem convention magic
- Automatic Layer reordering
- Core への Node-specific API 混入
- Architecture だけ表現すれば十分な Protocol の無理な adapter 実装
- 全 deployment platform 対応

---

# 34. 推奨初期 Package Boundary — DRAFT / NOT FROZEN

```text
@loutrefw/core
  Token
  Module definition
  Provider descriptor
  Contract/Procedure type
  Layer descriptor
  shared IR-facing type

@loutrefw/compiler
  TypeScript analysis
  Graph IR
  validation
  manifest

@loutrefw/runtime
  DI runtime
  execution scope
  Pipeline engine
  lifecycle
  error normalization
  logger context

@loutrefw/http
  HTTP protocol descriptor
  validate.* token
  http.controller terminal
  finalizer
  adapter interface

@loutrefw/runtime-node
@loutrefw/runtime-bun
@loutrefw/runtime-deno
@loutrefw/runtime-workerd
@loutrefw/runtime-lambda
@loutrefw/runtime-electron

@loutrefw/cli
```

Codex は初期段階で package 数を減らしてもよい。
ただし Core が runtime-specific にならないよう boundary は保つ。

---

# 35. External References / Prior Art — 非規範

Loutre は以下をコピーする必要はないが、設計確認に利用した。

## TypeScript

TypeScript class / `implements` semantics:

```text
https://www.typescriptlang.org/docs/handbook/2/classes
```

## Standard Schema

```text
https://github.com/standard-schema/standard-schema
```

## NestJS Lifecycle

```text
https://docs.nestjs.com/fundamentals/lifecycle-events
```

## oRPC

Contract-first:

```text
https://orpc.dev/docs/contract-first/implement-contract
```

MessagePort:

```text
https://orpc.dev/docs/adapters/message-port
```

Electron:

```text
https://orpc.dev/docs/adapters/electron
```

WebSocket:

```text
https://orpc.dev/docs/adapters/websocket
```

## Node.js Runtime Baseline

```text
https://nodejs.org/about/previous-releases
https://nodejs.org/en/blog/release/v26.0.0
```

2026-08-23 時点:

```text
Node.js 26.x = Current
Node.js 24.x = LTS
Node.js 26 LTS予定 = 2026-10
```

Loutre は user 指定により Node.js 26.x を primary baseline とする。

## Deno LTS

```text
https://docs.deno.com/runtime/fundamentals/stability_and_releases/
```

2026-08-23 baseline:

```text
Deno 2.9.x LTS
```

## Bun

```text
https://bun.com/
```

2026-08-23 baseline:

```text
Bun 1.4.x Stable
```

## Electron

```text
https://releases.electronjs.org/
https://releases.electronjs.org/schedule
```

2026-08-23 baseline:

```text
Electron 43.x Stable
```

## Cloudflare Workers / workerd

```text
https://developers.cloudflare.com/workers/configuration/compatibility-dates/
https://developers.cloudflare.com/workers/runtime-apis/nodejs/
```

v0.1 baseline:

```text
compatibility_date >= 2026-08-04
CIでは最新 compatibility_date を推奨
```

## AWS Lambda

Runtime:

```text
https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
```

Response Streaming:

```text
https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
```

2026-08-23 baseline:

```text
Latest managed Node runtime = nodejs24.x
Node.js 26 managed runtime planned = 2026-11
```

---

# 36. 「Phase 1 Architecture Complete」の定義

v0.1 architecture が実装済みとみなせる条件:

1. 4つの canonical fixture が compile/run する。
2. Fixture の invalid variation が compile/check time に useful diagnostic で落ちる。
3. 同一 core fixture logic が declared runtime conformance suite を通る。
4. HTTP unary + server-stream が Node-only Core assumption なしで動く。
5. Custom Token と same Module multiple instance が動く。
6. Pipeline order / validation position / arbitrary Layer-provided Token / short circuit / terminal placement / Controller DI availability が static model される。
7. Contract ↔ Protocol ↔ Pipeline ↔ Implementation binding を CLI graph で確認できる。
8. Env secret value が compile-time graph に不要。
9. Lifecycle / Capability limitation が visible で、暗黙 assumption になっていない。
10. Superseded architecture が明示的 design change なしに復活していない。
11. Node.js 26.x で primary Node conformance が通る。
12. Deno 2.9 LTS / Bun latest stable / workerd current / Electron latest stable / Lambda latest managed Node runtime でも対象 fixture が通る。

---

# 37. Codex Immediate Next Action

最初に minimal monorepo を作り、**Fixture A を end-to-end vertical slice として完成させる**。
ただし primitive は Fixture B〜D を redesign なしで追加できる shape にする。

最初の checkpoint:

```text
@loutrefw/core
  token<T>()
  @Inject()
  defineModule()
  provide()
  contract()
  procedure()
  http()
  validate.params/query/headers/body descriptor
  http.controller terminal descriptor
  ControllerOf / ContextOf
  implement(...).for(...).procedures(...).with(...)

@loutrefw/compiler
  minimal Graph model
  terminal-last validation
  implementation coverage validation
  validation-order metadata scaffolding

@loutrefw/runtime + @loutrefw/http
  application/execution scope
  Layer stack
  HTTP unary adapter
  Protocol Finalization
```

Reference runtime は **Node.js 26.x** から始める。

Fixture A が通ったら、surface area を増やす前に **Fixture B を即追加**する。

Fixture B が証明すべきこと:

```text
Pipeline は飾りではない
Layer ordering は static model されている
requires/provides は execution graph に効いている
execution-scoped DI が Controller terminal と接続している
invalid order は Compiler が説明できる
```

その後:

```text
Fixture C
  → parameterized Module / multiple instance / lifecycle

Fixture D
  → server-stream / Protocol portability / runtime conformance
```

---

# 38. Frozen Decision Summary — Codex 用短縮版

迷った場合はこの一覧を優先して確認する。

```text
Framework name
  Loutre

npm scope
  @loutrefw/*

Module
  defineModule<Args>(args => definition)
  explicit
  parameterized
  same module multiple instances OK

DI
  @Injectable() 不要
  custom typed token first-class
  custom token は @Inject(TOKEN)

Scopes
  application
  execution
  transient

Schema
  Standard Schema

Env
  injectable
  no global env
  AppEnv.key('KEY') symbolic ref

API
  Contract-first
  no route decorator as source of truth
  no top-level output/success/errors sugar

Protocol
  Procedure.protocols.*
  Pipeline は各 Protocol 内

Pipeline
  ordered Layer sequence
  array property = pipeline

Layer
  inbound/outbound
  no next()
  short circuit supported

HTTP validation
  validate.params
  validate.query
  validate.headers
  validate.body

Streaming body
  validate.body を使用可能
  必ず全量 consume する意味ではない

Refinement
  auth-specific API にしない
  Layer requires/provides arbitrary typed execution Token

Terminal
  pipeline の最後に必須
  exactly one

HTTP terminal
  http.controller

GraphQL terminal
  graphql.resolver

WebSocket terminal
  websocket.handler

MessagePort terminal
  messagePort.handler

Controller typing
  normal class method
  ControllerOf<...>
  ContextOf<...>

Binding
  Module owns binding
  implement(Contract).for(protocol).procedures(...).with(Implementation)

Implementation identity
  Contract × Procedure × Protocol → exactly one implementation

Controller scope
  Phase 1 execution-scoped

Protocol decode
  internal

Output validation / encode
  internal Protocol Finalization

Error
  throw accepted
  Domain Error protocol-neutral

Lifecycle
  Nest-like semantics

Logger
  structured contextual logger

Compiler
  Phase 1 core feature

Runtime architecture
  not Node-first

Primary Node baseline
  Node.js 26.x

Other runtimes
  latest LTS if official LTS exists
  otherwise latest Stable

Deno baseline 2026-08-23
  2.9.x LTS

Bun baseline 2026-08-23
  1.4.x Stable

Electron baseline 2026-08-23
  43.x Stable

Cloudflare/workerd
  latest compatibility_date
  v0.1 minimum >= 2026-08-04

AWS Lambda baseline 2026-08-23
  managed nodejs24.x
  nodejs26.x 公開後に更新
```

---

**End of Loutre Architecture v0.1 — FROZEN baseline.**
