# Loutre Architecture v0.1

> **状態:** Phase 1 アーキテクチャの FROZEN ベースライン  
> **日付:** 2026-08-24 (JST)  
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
- Layer が require / provide する Execution Context Key
- Lifecycle hook
- Env による条件分岐
- Runtime capability requirement
- Contract ↔ Controller / Resolver / Handler binding
- Controller 等の application DI requirement

Compilerはruntimeより前にGraphを検証し、inspection用のGraph Manifestと、
runtime adapterが利用するRuntime Linkage Artifactを同じGraph IRから生成する。

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

CompilerがTypeScript AST / type informationとLoutre declarationを解析し、
Graph ManifestとRuntime Linkage Artifactを生成する。

通常のconstructor型から得たDI依存辺はCompilerがRuntimeへ自動接続する。
利用者にCompilerの解析結果と同じ依存mapを再記述させてはならない。

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
6. `application` / `transient` scope
7. Standard Schema integration
8. Injectable typed Env
9. Env schema 由来の symbolic key
10. Contract / Procedure
11. Protocol-local ordered Pipeline
12. Layer execution model
13. HTTP Protocol
14. HTTP Validation Layer (`params/query/headers/body`)
15. Authentication Layer / Guard Layer
16. 任意 developer-defined Context Key の provide による Execution Context 拡張/refinement
17. Short circuit
18. Error normalization / Protocol finalization
19. Structured contextual Logger
20. Compiler Graph IR / static validation / Graph Manifest / Runtime Linkage Artifact
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
      ├── Graph Manifest generation
      └── Runtime Linkage Artifact generation
              │
              ▼
      Application Bootstrap
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
  description: "Database connection",
  imports: [],
  providers: [],
  implementations: [],
  exports: [],
  lifecycle: {},
}));
```

## 6.2 `@Module class` ではなく `defineModule()` — FROZEN

Phase 1 の Module 表現は class decorator ではなく、以下を採用する。

```ts
defineModule<Args>((args) => ModuleDefinition);
```

理由:

- Module は parameterized structural template である。
- 同一 Module の複数 instance が自然に表現できる。
- Args を Provider / Lifecycle / conditional definition に利用しやすい。
- Compiler が解析しやすい。
- Runtime state は基本 Provider が持つべきで、Module definition object 自体に持たせる必要がない。

## 6.3 同一 Module の複数 Instance を許可

```ts
export const PRIMARY_DB = token<Database>("database.primary");
export const ANALYTICS_DB = token<Database>("database.analytics");

export const AppModule = defineModule(() => ({
  imports: [
    DatabaseModule({
      provide: PRIMARY_DB,
      url: AppEnv.key("PRIMARY_DATABASE_URL"),
    }),

    DatabaseModule({
      provide: ANALYTICS_DB,
      url: AppEnv.key("ANALYTICS_DATABASE_URL"),
    }),
  ],
}));
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

通常class dependencyはCompilerがconstructorの型から解析する。

```ts
export class UserService {
  constructor(private readonly users: UserRepository) {}
}
```

`@Injectable()` を必須にしない。

`providers: [UserRepository]`はProvider bindingを宣言し、constructorの
`users: UserRepository`は依存辺を宣言する。この2つは役割が異なる。
Moduleは利用可能なProviderを列挙するが、constructor parameterとProviderを
位置や個数から推測しない。

CompilerはTypeScript Type Checkerでconstructor parameterのsymbolを解決し、
DI Graphに次の辺を記録する。

```text
UserService.constructor[0] -> UserRepository
```

通常class tokenで解決できないinterface、custom token、同一型の複数binding等は
`@Inject(TOKEN)`でCompiler-visibleなtokenを明示する。

Runtimeは次の方法でconstructor tokenを推測してはならない。

- `constructor.length`だけを使ったparameter位置合わせ
- parameter名やclass名の文字列比較
- 登録Providerが1つだけであることを根拠にした自動選択
- `emitDecoratorMetadata`やruntime reflectionへの必須依存

Compilerが依存を一意に解決できない場合はcompile/check time diagnosticとする。

## 7.2 Arbitrary custom token は first-class

```ts
export const PRIMARY_DB = token<Database>("database.primary");
```

Optional metadata は MAY:

```ts
export const PRIMARY_DB = token<Database>("database.primary", {
  description: "Primary application database",
});
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
providers: [UserService];
```

は self-binding class Provider の shorthand とみなす。

### Conditional Provider

```ts
provide(Storage).select(AppEnv.key("STORAGE_DRIVER"), {
  memory: MemoryStorage,
  s3: S3Storage,
});
```

Env key の型が finite union の場合、Compiler は mapping exhaustiveness を検証 SHOULD。

## 7.5 Scope

Phase 1 の DI scope 名は FROZEN:

```text
application
transient
```

**`execution` DI scope は Phase 1 では提供しない。**

理由:

- request/session/tenant/permission 等の実行途中で得られるデータは DI ではなく **Execution Context (`ctx`)** に置く。
- Controller / Resolver / Handler を execution ごとに再生成する必要をなくす。
- HTTP の request scope を WebSocket / MessagePort / Electron 等へ一般化するためだけの DI scope を持たない。
- DI Graph と Pipeline Context Graph を明確に分離する。

### Protocol Implementation の Scope

Controller / Resolver / Handler は **application-scoped** を基本とする。

```text
Application Scope
  ├─ Controller / Resolver / Handler
  ├─ Service
  ├─ Repository
  └─ Logger (static source context)

Execution Context
  ├─ validated params/query/headers/body
  ├─ auth/session
  ├─ currentTenant / permissions
  ├─ requestId / executionId / traceId
  └─ execution Logger
```

Pipeline の途中で生成された値を constructor DI してはならない。
それらは terminal method の `ctx` から読む。

## 7.6 Compiler outputからRuntimeへのDI接続 — FROZEN

利用者が書くApplication entryは、Moduleだけを渡す形を基準とする。

```ts
export default createHttpApplication({
  modules: [AppModule()],
});
```

`createHttpApplication()`、`createMessagePortApplication()`および将来の
Protocol application factoryは、利用者向けoptionとして
`constructorDependencies`、constructor registry、手書きDI manifestを
受け取ってはならない。

Compiler outputは役割の異なる次の2 artifactに分ける。

### Graph Manifest

- JSON等へserialize可能
- class/tokenをsymbolic identityで表現
- Graph表示、diagnostic、deployment検証、cacheに利用
- function object、secret、実行時のProvider valueを含めない

### Runtime Linkage Artifact

- Compilerが生成する実行可能な内部artifact
- constructor本体と依存tokenのlive referenceを保持
- Graph IRのconstructor DI edgeと一対一に対応
- Runtime containerがinstance生成時に直接利用
- 利用者が編集・列挙するPublic APIではない

概念上は次の情報を持つ。exactな生成module形式や内部symbol名はPublic APIではない。

```text
GreetingController -> [GreetingService]
UserRepository     -> [PRIMARY_DB]
```

CompilerはGraph ManifestとRuntime Linkage Artifactに同じGraph version/fingerprintを
付与し、組み合わせが一致しないartifactの起動を拒否しなければならない。

### Bootstrap flow

```text
Application entry
      ↓
Compiler parse/type-check/validate
      ├─ Graph Manifest
      └─ Runtime Linkage Artifact
              ↓
linked Application entry
              ↓
Runtime Adapter
```

`loutre dev`、`loutre start`、`loutre build`はApplication entryを直接実行する前に
このcompile/link処理を行う。deployment artifactもCompilerが生成したlinked entryを
起点にする。raw TypeScript entryをCompilerを通さず直接実行する経路はcanonicalな
起動方法ではない。

Runtime Linkage Artifactがない状態で通常constructor dependencyを持つclassを
instantiateしようとした場合、Runtimeは曖昧なfallbackを行わず、Compiler経由の
起動が必要であることを示すactionable errorで停止する。

Runtime package内部でlinkage tableを受け取るnarrow interfaceを持つことはMAY。
ただし、そのinterfaceをApplication authorが手書きするPublic APIにしてはならない。

### Ownershipとlifecycle

- Runtime Linkage Artifactはprocess-global registryではなくApplication instanceに属する。
- linked bootstrapはApplicationの`initialize()`および最初のProvider解決より前に、
  internal runtime boundaryを通してartifactを1回だけ関連付ける。
- 関連付け後のDI Graphはimmutableとし、起動後の差し替えを許可しない。
- 同一processで複数Applicationを起動してもlinkage tableを共有・衝突させない。
- Protocol application factoryはCompiler、filesystem、Node.js APIへ依存しない。
- CLI/build toolingがCompilerを呼び出し、generated bootstrapがRuntimeのinternal boundaryを
  利用し、Runtime Adapterはlink済みApplicationだけを受け取る。

---

# 8. Env Model — FROZEN

Env は Standard Schema を使う injectable service。
Global mutable `env` は作らない。

```ts
const AppEnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]),
  STORAGE_DRIVER: z.enum(["memory", "s3"]),
  PRIMARY_DATABASE_URL: z.string(),
});

export class AppEnv extends defineEnv(AppEnvSchema) {}
```

Runtime code:

```ts
export class SomeService {
  constructor(private readonly env: AppEnv) {}

  run() {
    this.env.STORAGE_DRIVER;
  }
}
```

## 8.1 Compiler-visible symbolic Env key

Actual secret/value を compile-time graph declaration に埋めない。

```ts
AppEnv.key("STORAGE_DRIVER");
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
      http: http({
        /* ... */
      }),
    },
  }),
});
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
      method: "PATCH",
      path: "/articles/{id}",

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
});
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
    headers: {
      'cache-control': 'private',
    },
  },

  notFound: {
    status: 404,
    body: UserNotFoundSchema,
    error: UserNotFound,
  },
}
```

Domain Error 自体に HTTP status を埋め込まない。

Controllerのresponse helperは単一result objectを受け取る。`body`は必須、requestごとに
変わるheaderは`headers`へ指定する。

```ts
return ctx.response.updated({
  body: user,
  headers: {
    etag: `"${user.version}"`,
  },
});
```

response定義のstatic headerとresultのdynamic headerが同名の場合はdynamicを優先する。
`content-type`等、Protocol Finalizationが所有するheaderは最後にframeworkが設定する。
複数値を持つheaderは`readonly string[]`で宣言できる。

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
];
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
});
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
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
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
validate.params;
validate.query;
validate.headers;
validate.body;
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
];
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

# 15. Execution Context / Authentication / Guard / Arbitrary Refinement — FROZEN

## 15.1 DI と Execution Context を分離する

Loutre は以下を別物として扱う。

```text
Constructor DI
  = Application Graph 上の長寿命 dependency

Execution Context (`ctx`)
  = その1回の Protocol execution の途中で得られたデータ
```

したがって、以下は **禁止する設計**。

```ts
constructor(
  @Inject(SESSION) readonly session: Session,
  @Inject(CURRENT_TENANT) readonly tenant: CurrentTenant,
) {}
```

認証情報、tenant、permission、resource resolution 等は `ctx` に入れる。

```ts
async update(
  ctx: ContextOf<ArticlesHttp, 'update'>,
) {
  ctx.session.user
  ctx.currentTenant
  ctx.permissions
}
```

これにより、同じ application-scoped Controller に public procedure と authenticated procedure を共存させられる。

```ts
export class UsersController {
  constructor(private readonly users: UsersService) {}

  async getPublic(ctx: ContextOf<UsersHttp, "getPublic">) {
    // ctx.session は存在しない
  }

  async getMe(ctx: ContextOf<UsersHttp, "getMe">) {
    ctx.session.user.id; // User
  }
}
```

## 15.2 Context Key API — FROZEN

Application ごとに必要な execution data は異なるため、Loutre は Auth/Tenant 等の shape を固定しない。

Developer は任意の Context Key を宣言できる。

基準 API:

```ts
export const AUTH = contextKey("auth").of<AuthState>();

export const SESSION = contextKey("session").of<Session>();

export const CURRENT_TENANT = contextKey("currentTenant").of<CurrentTenant>();

export const PERMISSIONS = contextKey("permissions").of<PermissionSet>();
```

`ContextKey<Name, T>` は DI Token ではない。
Execution Context の property 名・型・Graph identity を表す Compiler-visible descriptor である。

`contextKey('session').of<Session>()` の形を採用する理由:

1. property 名の string literal (`'session'`) を TypeScript 型に保持できる。
2. 値の型 `Session` を明示できる。
3. `requires/provides` を静的に Graph 化できる。
4. Controller では `ctx.session` と普通の property access になる。
5. application-wide registry を必須にしない。

### 比較して採用しなかった案

**案B: Layer の return object だけから Context shape を推論**

```ts
return { session };
```

DX は短いが、Layer declaration だけでは依存関係が分からず、Graph/diagnostic/static ordering validation が弱くなるため primary API にしない。

**案C: `defineContext({...})` で全 Context slot を registry 化**

型安全だが、application-wide registry の管理と boilerplate が増える。必要になれば将来 helper として追加 MAY。

## 15.3 Layer の `requires / provides`

Layer は Context Key を明示的に require/provide する。

HTTP Basic認証では`@loutrefw/http`の`basicAuth()`を使用できる。HTTP adapterが
decodeしたAuthorization headerの解析、Basic schemeの検証、credentialsのdecodeは
Layerが担当し、applicationは資格情報の検証とprincipalのContext Keyだけを指定する。

```ts
export const basicAuthentication = basicAuth({
  realm: "Loutre Admin",
  principal: CURRENT_USER,
  async authenticate({ username, password }) {
    return await users.verifyPassword(username, password);
  },
  unauthorized: {
    variant: "unauthorized",
    body: { message: "認証が必要です" },
  },
});
```

`authenticate`が`null`または`undefined`を返した場合、Layerは`unauthorized.variant`へ
short circuitする。Protocol Finalizationはbody schemaを検証し、HTTP 401と
`WWW-Authenticate: Basic realm="...", charset="UTF-8"`を生成する。
Compilerは`principal`をLayerの`provides`としてGraph化する。

```ts
export const bearerAuthentication = authentication({
  provides: [AUTH],

  async inbound(ctx) {
    const user = await verifyBearer(ctx.headers.authorization);

    return {
      auth: { user },
    };
  },
});
```

後段では:

```ts
ctx.auth; // AuthState
```

Guard:

```ts
export const authenticated = guard({
  requires: [AUTH],
  provides: [SESSION],

  inbound(ctx) {
    if (!ctx.auth.user) {
      throw Unauthorized();
    }

    return {
      session: {
        user: ctx.auth.user,
      },
    };
  },
});
```

Tenant Layer:

```ts
export const resolveTenant = layer({
  requires: [SESSION],
  provides: [CURRENT_TENANT, PERMISSIONS],

  async inbound(ctx) {
    const tenant = await findTenant(ctx.session.user, ctx.params.tenantId);

    return {
      currentTenant: tenant,
      permissions: permissionsFor(ctx.session.user, tenant),
    };
  },
});
```

`provides` に宣言した Key と `inbound` の返却 object は TypeScript と Compiler の両方で整合性を検証 MUST。

Phase 1 では同名 Context Key の暗黙 overwrite を禁止する。
既存 property をより強い型へ置き換える専用 `refines` API は OPEN とし、まずは `auth → session` のように別 Key で状態遷移を表す。

## 15.4 Pipeline は Context の型変換列

Pipeline の本質は、Layer の列によって Execution Context を段階的に拡張/refineすることである。

```text
C0
  headers: unknown
  params: unknown
  body: unknown

  ↓ validate.headers

C1
  headers: AuthHeaders

  ↓ bearerAuthentication

C2
  auth: AuthState

  ↓ authenticated

C3
  session: Session

  ↓ validate.params

C4
  params: ArticleParams

  ↓ resolveTenant

C5
  currentTenant: CurrentTenant
  permissions: PermissionSet

  ↓ validate.body

C6
  body: UpdateArticle

  ↓ http.controller
```

`ContextOf<ImplementationType, Procedure>` は terminal 到達時点の Context 型を表す。

Validation Layer も同じ Context refinement model の built-in specialization とみなす。

## 15.5 Compiler Validation

Invalid:

```text
1 authenticated
   requires ctx.auth   ← unavailable

2 bearerAuthentication
   provides ctx.auth

3 http.controller
```

Compiler は以下を検証 MUST。

- `requires` Key がその位置で存在すること
- `provides` Key の返却型が宣言型に一致すること
- duplicate Context Key が暗黙 overwrite されないこと
- validated params/query/headers/body の必要条件
- terminal method の `ContextOf` が Pipeline 最終 Context と一致すること

Diagnostic は「必要な Key が後段で provide されている」ことまで含む path-aware explanation を SHOULD 出す。

# 16. Short Circuit — FROZEN concept

Layer は残りの inbound と terminal invocation を打ち切り、Logical Result を返せる。

Conceptual API:

```ts
return shortCircuit(result);
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
http.controller;
graphql.resolver;
websocket.handler;
messagePort.handler;
```

Compiler IR 内部では共通して `TerminalLayer` と呼んでよい。

Valid:

```ts
pipeline: [validate.params, authenticated, http.controller];
```

Invalid:

```ts
pipeline: [http.controller, tracing];
```

---

# 18. Pipeline の配置 — FROZEN

Pipeline は Procedure root ではなく、**各 Protocol definition の中**に置く。

```ts
procedure({
  protocols: {
    http: http({
      pipeline: [validate.headers, bearerAuthentication, http.controller],
    }),

    messagePort: messagePort({
      pipeline: [desktopSession, messagePort.handler],
    }),
  },
});
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
type UsersHttp = ControllerOf<typeof UsersContract, "http">;

export class UsersController implements UsersHttp {
  constructor(private readonly users: UsersService) {}

  async get(ctx: ContextOf<UsersHttp, "get">) {
    const user = await this.users.find(ctx.params.id);

    if (!user) {
      throw UserNotFound({ id: ctx.params.id });
    }

    return ctx.response.found({ body: user });
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
type Users = ControllerOf<typeof UsersContract>;
Users.Context<"get">;
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
  providers: [UsersService, UsersRepository],

  implementations: [implement(UsersContract).for(http).with(UsersController)],
}));
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
    .procedures("get", "list")
    .with(UserQueryController),

  implement(UsersContract)
    .for(http)
    .procedures("create", "update", "delete")
    .with(UserCommandController),
];
```

Type utility も procedure subset を表現可能にする。

```ts
type UserQueriesHttp = ControllerOf<
  typeof UsersContract,
  "http",
  "get" | "list"
>;
```

Generic ordering は implementation detail。
機能自体は FROZEN。

## 20.3 1 Implementation class が複数 Contract を実装してよい

```ts
implement(AccountContract).for(http).with(AccountController);
implement(ProfileContract).for(http).with(AccountController);
```

Method name が incompatible collision する場合、Phase 1 は alias/mapping sugar を追加せず class 分割を要求する。

## 20.4 Protocol-specific implementation を推奨

```ts
implementations: [
  implement(UsersContract).for(http).with(UsersController),

  implement(UsersContract).for(graphql).with(UsersResolver),
];
```

HTTP Context と GraphQL Context は semantics が異なる。
Domain Service を下層で共有する。

## 20.5 Coverage Diagnostics

Compiler MUST detect:

- missing implementation coverage
- duplicate coverage
- implementation type mismatch
- terminal/protocol mismatch
- implementation constructor が application DI Graph 上で解決不能

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
return ctx.response.created({ body: user });
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
  code: "USER_NOT_FOUND",
  data: z.object({
    userId: z.string(),
  }),
});
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
export class Database implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.close();
  }
}
```

## 23.2 Declarative Module Lifecycle

Module coordination hook は declarative に定義可能。
Compiler-visible であり、ModuleInstance provider を inject できる。

```ts
export const DatabaseModule = defineModule<DatabaseModuleArgs>((args) => ({
  providers: [
    /* ... */
  ],

  lifecycle: {
    onModuleInit: hook({
      inject: [args.provide, Logger],

      async run(db, logger) {
        await db.verifySchema();
        logger.info("Database ready");
      },
    }),
  },
}));
```

Exact `hook()` syntax は OPEN。

## 23.3 Serverless Shutdown

Shutdown hook が全 runtime/serverless で確実に実行されると仮定してはいけない。

Capability 例:

```text
runtime.shutdownHook
```

Execution Context 上の一時データは application lifecycle resource ではない。

---

# 24. Logger — FROZEN

Phase 1 から structured Logger を含める。
ただし **static application context** と **execution context** を分離する。

## 24.1 Constructor-injected Logger = static source context

Application-scoped Provider / Controller / Service は Logger を constructor DI できる。

```ts
export class UserService {
  constructor(private readonly logger: Logger) {}
}
```

以下は不要:

```ts
new Logger(UserService.name);
```

Compiler/Container は injection site から最低以下の static metadata を付与する。

```text
module
source/provider/service
```

この Logger に `requestId` / `traceId` / `procedure` 等の execution-specific metadata が自動で入ることを保証してはならない。
Core は AsyncLocalStorage 等の ambient runtime context に依存しない。

## 24.2 `ctx.logger` = execution Logger

Base Execution Context は execution-aware Logger を持つ。

```ts
async create(
  ctx: ContextOf<UsersHttp, 'create'>,
) {
  ctx.logger.info('Creating user')
}
```

`ctx.logger` の候補 metadata:

```text
protocol
procedure
implementation/method
executionId
requestId (HTTP 等で存在する場合)
traceId (存在する場合)
```

例:

```json
{
  "level": "info",
  "message": "Creating user",
  "protocol": "http",
  "procedure": "users.create",
  "source": "UsersController.create",
  "executionId": "exec_xxx",
  "requestId": "req_xxx",
  "traceId": "..."
}
```

## 24.3 Propagation rule

Constructor Logger と `ctx.logger` は別責務。
Application Service 内で execution correlation が必要な場合、Phase 1 は ambient magic を前提にしない。
必要なら caller が execution Logger または明示的な observability context を Service API に渡す。

`ctx.logger.child(...)` 等の exact child/binding API は OPEN。
OpenTelemetry integration も adapter として後から追加する。

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
   ├─ Graph Manifest
   └─ Runtime Linkage Artifact
              ↓
           Runtime
```

## 25.1 Compiler Responsibilities

最低以下を理解する。

- `defineModule()` template / instance
- Module imports / exports
- Provider binding
- Custom token
- Constructor parameter symbolの解決とDI edge生成
- DI edgeからRuntime Linkage Artifactを生成
- Graph ManifestとRuntime Linkage Artifactの整合性保証
- Scope
- Context Key / Pipeline Context typing
- Env symbolic key
- Conditional provider
- Contract / Procedure
- Protocol definition
- Response/message schema
- Pipeline order
- Layer role
- Validation position
- Layer Context `requires` / `provides`
- Context shape propagation/refinement
- Terminal placement
- Implementation coverage
- Controller/Resolver application constructor requirement
- Lifecycle dependency/order
- Runtime Capability requirement

## 25.2 Static Diagnostics

### Context Key が未提供

```text
Pipeline:
1 authenticated
   requires ctx.auth      ← error
2 bearerAuthentication
   provides ctx.auth
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

### Controller Context vs Pipeline

```text
AccountController.getMe expects ctx.session,
but the HTTP Pipeline does not provide SESSION before http.controller.
```

### Controller application DI

```text
UsersController requires UsersService,
but UsersService is not visible in the Module DI Graph.
```

### Runtime linkageの欠落

```text
UsersController.constructor[0] resolves to UsersService,
but no runtime linkage was emitted for this DI edge.
```

Diagnostic は dependency/path を含む actionable なものにする。

## 25.3 Conditional Graph

Finite Env branch は可能な限りすべて validate し、developer の current env だけを検証して終わらない。

## 25.4 Manifest / Runtime Linkage Boundary — FROZEN

Graph Manifestはinspection向けのserializable artifact、Runtime Linkage Artifactは
実行時参照を保持するexecutable artifactとする。Compilerは片方だけを更新してはならない。

Runtime Linkage Artifactの生成では、source上で`import type`になっている依存も、
実行に必要ならCompilerが安全なvalue referenceとしてemitする。利用者にlinkageのためだけの
不要なexport、side-effect import、registry記述を要求してはならない。

Bundler/minifier後もconstructor/token identityが維持されるよう、class名の文字列を
runtime identityに使ってはならない。

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

- 2026-08-24 時点の Node.js 26.x は **Current** で、LTS 入りは 2026-10 予定。
- それでも Loutre の primary Node runtime baseline は **Node.js 26.x** とする。

## 27.2 2026-08-24 時点の Phase 1 Conformance Matrix

| Target                          | Baseline                    | Policy                         | Phase 1 |
| ------------------------------- | --------------------------- | ------------------------------ | ------: |
| Node.js                         | **26.x**                    | user 指定。Current でも採用    |      ✅ |
| Bun                             | **1.4.x**                   | LTS制度なし → 最新Stable       |      ✅ |
| Deno                            | **2.9.x LTS**               | 最新LTS channel                |      ✅ |
| Cloudflare Workers / workerd    | **最新 compatibility date** | evergreen runtime              |      ✅ |
| Electron main                   | **43.x**                    | LTS制度なし → 最新Stable major |      ✅ |
| Electron renderer / MessagePort | **43.x**                    | Electron stable に追従         |      ✅ |
| AWS Lambda managed Node.js      | **24.x (`nodejs24.x`)**     | 現在の最新 managed runtime     |      ✅ |

### AWS Lambda Node.js 26 について

2026-08-24 時点では AWS Lambda managed runtime の Node.js 26 はまだ提供されていない。
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

2026-08-24 時点の LTS channel は **Deno 2.9**。
Conformance は 2.9.x LTS の最新 patch を使用する。

## 27.4 Bun

Bun は Node/Deno 型の LTS channel を前提としないため、Phase 1 baseline は **最新 Stable 1.4.x**。
CI では supported range をむやみに固定せず、最新 Stable への追従テストを行う。

## 27.5 Electron

Electron は LTS ではなく active stable majors を更新する model。
2026-08-24 時点の最新 Stable は **Electron 43.x**。

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
loutre dev <entry>
loutre build <entry> --out-dir <directory>
loutre start <entry>

loutre check
loutre doctor

loutre graph modules
loutre graph di
loutre graph contracts
loutre graph runtime

loutre explain <target>
```

Phase 1 output は terminal text でよい。

`dev`、`build`、`start`のentryはfilesystem discoveryを行わず明示的に指定する。
これらのcommandはSection 7.6のcompile/link/bootstrap flowを共有し、同一sourceから
同一Graph versionのGraph ManifestとRuntime Linkage Artifactを生成する。

## 28.1 `dev` incremental/watch compile — FROZEN

`loutre dev`はTypeScript Compiler API sessionをprocess lifetime中維持し、source変更ごとに
snapshotを更新する。各snapshotからGraph ManifestとRuntime Linkage Artifactを必ず一緒に
再生成し、古いGraphに新しいruntime referenceだけを継ぎ足してはならない。

watch対象はApplication entryから到達するsource、bundlerが実際に読み込んだsource、
および`tsconfig.json`とする。再生成により到達可能sourceが変化した場合はwatch対象も
置き換える。短時間に連続するfilesystem eventはまとめ、compile中に届いた変更は直後の
追加compileとして直列化する。

再起動は次の順序で行う。

```text
HTTP server close
  -> current Application shutdown('reload')
  -> incremental compile/link
  -> bundle/import
  -> next Application initialize
  -> HTTP server listen
```

source変更時はcurrent Applicationを先に停止し、listen socketも閉じる。compile、bundle、
import、initialize、listenのいずれかが失敗した場合はApplicationを停止したままwatchを継続し、
次のsource変更で再起動を試みる。成功時は同じportで新しいlisten socketを開く。

HTTP serverのlisten完了はRuntime AdapterからHttpApplicationへ通知する。
`onServerListening(url)`はpublic lifecycle hookとし、`createHttpApplication()`の
`lifecycle` optionで利用者が処理を定義する。Protocol Applicationのlifecycle hookは
top-levelへ個別に追加せず、共通して`lifecycle` object配下へ置く。
`createHttpApplication()`は既定のApplication起動ログを出さず、Applicationが必要なlogger、
文言、形式を選ぶ。

`loutre dev/start`はApplication logとは別にframework startup panelをterminalへ出す。
panelはLoutre wordmark、version、Application名、Server、Runtime、Environment、
実測startup duration、`ʕ•ᴥ•ʔ`を含み、watchによる再起動でも同じ形式で出す。
十分な幅のTTYでは24-bit ANSI colorを使う。terminal幅がpanelの計算上の必要幅に満たない場合と
non-TTYでは、巨大wordmarkとANSI sequenceを含まないcompact outputへfallbackする。
`NO_COLOR`、`NODE_DISABLE_COLORS`、`FORCE_COLOR`はNode.jsのcolor depth判定と合わせて扱う。
このpanelはCLI processの状態を示すもので、Application固有logの代替ではない。

compile成功の判定にはTypeScriptのsyntax、bind、semantic diagnosticを含める。
JavaScript変換だけを行うbundlerが成功しても、TypeScript errorが残っている場合は
Applicationを起動せず、file、line、column、diagnostic codeとmessageをterminalへ表示する。

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
   └─ provides ctx.auth
4 validate.params           validation
5 authenticated             guard
   ├─ requires ctx.auth
   └─ provides ctx.session
6 canEditArticle            guard
   ├─ requires validated params
   └─ provides ctx.currentArticle
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
- Compilerが生成したRuntime Linkage Artifactによるdecorator不要のconstructor DI
- Application entryに手書きconstructor dependency mapが存在しないこと

概念:

```text
GET  /users/{id}
POST /users
```

## Fixture B — Bearer Auth + Guard + Arbitrary Execution Context

検証対象:

- `validate.headers`
- Authentication Layer
- Guard Layer
- developer-defined Context Key
- `requires` / `provides`
- Pipeline Context の段階的型拡張
- application-scoped Controller
- public/authenticated procedure の同一 Controller 共存
- invalid Pipeline order diagnostic

例:

```text
bearerAuthentication
  provides ctx.auth

authenticated
  requires ctx.auth
  provides ctx.session

tenantAccess
  requires ctx.session
  provides ctx.currentTenant
```

Controller は constructor DI ではなく:

```ts
ctx.session;
ctx.currentTenant;
```

から execution data を読む。

この fixture は **DI Graph と Pipeline Context Graph が分離され、ContextOf が terminal 時点の型を表すことの証明**。

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
token<T>('id')
contextKey('name').of<T>()
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
- application/transient scope
- Controller application-scope instantiate
- Compiler生成linkageを受け取るinternal runtime boundary
- linkage欠落時のactionable error

## Stage 3 — Compiler Graph IR

- AST/type analysis
- Module Graph
- Provider Graph
- Contract/Protocol Graph
- Pipeline Graph
- Implementation Binding Graph
- basic diagnostic
- serializable Graph Manifest
- executable Runtime Linkage Artifact
- Graph version/fingerprint整合性
- constructor parameter symbolからruntime token referenceへのlink

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
dev <entry>
start <entry>
build <entry> --out-dir <directory>
```

`dev`、`start`、`build`はGraph検査だけでなくRuntime Linkage Artifactを生成し、
linked Application entryを実行または出力する。CLIがraw entryをそのままimportしてから
DI情報を後付けする順序にはしない。

---

# 31. Superseded / Rejected Decisions — 勝手に復活させない

## 31.1 Filesystem convention-first discovery — REJECTED

Application structure は explicit Module/Graph。

## 31.2 `@Injectable()` requirement — REJECTED

普通の class constructor を Compiler が解析する。

## 31.3 `@Inject(TOKEN)` を完全排除 — REJECTED

Custom token では普通に使用する。

## 31.3.1 手書きconstructor dependency map — REJECTED

`createHttpApplication({ constructorDependencies: ... })`のように、Compilerが解析した
通常constructor依存をApplication authorへ再記述させない。

一時的な実装scaffoldingとしてRuntime内部に存在してもよいが、canonical fixture、
example、Public APIへ露出させてはならず、Phase 1完成前に除去する。

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

Auth 固有 API にはしない。Generic `requires/provides` + developer-defined Context Key にする。

## 31.20a Layer-provided execution data を DI Token にする — SUPERSEDED / CRITICAL FIX

以下は撤回:

```ts
constructor(
  @Inject(SESSION) session: Session,
  @Inject(CURRENT_TENANT) tenant: CurrentTenant,
) {}
```

Authentication / Session / Tenant / Permission 等は Execution Context (`ctx`) に置く。

```ts
ctx.session;
ctx.currentTenant;
```

DI Graph と Pipeline Context Graph を混ぜない。

## 31.20b Controller を execution-scoped にする — SUPERSEDED / CRITICAL FIX

Controller / Resolver / Handler は Phase 1 では application-scoped。
`execution` DI scope 自体を Phase 1 から削除する。

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
- [x] Context Key の基準形: `contextKey('name').of<T>()`
- [x] `requires` / `provides` は Context Key 配列を使う
- [ ] Context Key object の exact runtime representation / branding
- [ ] `shortCircuit(...)` exact API
- [x] `ctx.response.created({ body, headers? })` response helper API
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
- [ ] Graph Manifest serialization format
- [ ] Runtime Linkage Artifactのgenerated module形式
- [ ] linked entryのemit方式とsource map
- [ ] `defineModule()` 内の arbitrary TypeScript をどこまで static evaluate するか
- [ ] Symbolic expression representation
- [x] Incremental/watch compile strategy

## 32.8 DI / Scope

- [x] Phase 1 DI scope は `application` / `transient` のみ
- [x] Controller / Resolver / Handler は application-scoped
- [x] execution-specific data は DI ではなく `ctx`
- [x] 通常constructor dependencyはCompilerがRuntimeへ自動接続
- [x] 手書きconstructor dependency mapはPublic APIにしない
- [ ] Factory Provider exact syntax
- [ ] `.select()` exact syntax
- [ ] finite union exhaustiveness rule
- [ ] Circular dependency policy
- [ ] Lazy Provider/reference を持つか
- [ ] Long-lived WebSocket/duplex の Execution Context lifetime/ownership
- [ ] Execution Context cleanup timing

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

- [x] Constructor `Logger` は static source context (`module` / `source`)
- [x] `ctx.logger` は execution context (`procedure` / `protocol` / ids)
- [x] Core は AsyncLocalStorage 等の ambient propagation を必須にしない
- [ ] `ctx.logger.child(...)` / binding API exact shape
- [ ] Stable field name set
- [ ] Trace/span integration
- [ ] OpenTelemetry adapter timing

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
- [x] Dev server
- [x] Build/watch implementation
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
  DI Token
  ContextKey
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
  DI runtime (application/transient)
  Execution Context runtime
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

2026-08-24 時点:

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

2026-08-24 baseline:

```text
Deno 2.9.x LTS
```

## Bun

```text
https://bun.com/
```

2026-08-24 baseline:

```text
Bun 1.4.x Stable
```

## Electron

```text
https://releases.electronjs.org/
https://releases.electronjs.org/schedule
```

2026-08-24 baseline:

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

2026-08-24 baseline:

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
6. Pipeline order / validation position / arbitrary Layer-provided Context Key / short circuit / terminal placement / final `ContextOf` shape が static model される。
7. Contract ↔ Protocol ↔ Pipeline ↔ Implementation binding を CLI graph で確認できる。
8. Env secret value が compile-time graph に不要。
9. Lifecycle / Capability limitation が visible で、暗黙 assumption になっていない。
10. Superseded architecture が明示的 design change なしに復活していない。
11. Node.js 26.x で primary Node conformance が通る。
12. Deno 2.9 LTS / Bun latest stable / workerd current / Electron latest stable / Lambda latest managed Node runtime でも対象 fixture が通る。
13. canonical fixtureとexampleのApplication entryが手書きconstructor dependency mapを持たず、Compiler生成のRuntime Linkage Artifactだけで通常class DIを実行できる。
14. Graph ManifestとRuntime Linkage Artifactの不一致が起動前に検出される。

---

# 37. Codex Immediate Next Action

2026-08-24にCompiler生成Runtime Linkage Artifactへの移行を完了した。

- 通常constructorと`@Inject(TOKEN)`からDI edgeを生成
- Graph ManifestとRuntime Linkage Artifactを同じGraph IRから生成
- `loutre dev/start/build`をcompile/link/bootstrap flowへ統一
- version/fingerprint検証とlinkage欠落diagnosticを実装
- Protocol application factoryから手書きdependency optionを削除
- canonical fixtureと`examples/`から手書きdependency mapを削除
- Node.js、Deno、Bun、workerd、Electron、Lambdaでlinked artifactをconformance検証

`loutre dev`のincremental/watch compileを実装し、同じGraph/linkage invariantを保ったまま
last-good Applicationへfallbackするhot reloadを追加した。次の優先課題は、Section 32.7で
OPENのgenerated module形式とsource mapを詰めることである。

Compilerを通さないunit test用の低水準linkage注入はtest/internal boundaryへ隔離し、
今後もPublic APIやexampleへ露出させない。

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
  通常constructor依存はCompilerが自動link
  手書きconstructor dependency mapは禁止

DI Scopes
  application
  transient

Execution data
  DI に入れない
  ctx に保持

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

Execution Context
  Layer が ctx を段階的に拡張/refine
  developer-defined Context Key
  contextKey('name').of<T>()
  requires/provides は Context Key を使う

Refinement
  auth-specific API にしない
  auth/session/tenant/permission は ctx data

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
  Phase 1 application-scoped
  execution-specific data は ContextOf 経由

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
  constructor Logger = static source context
  ctx.logger = execution context
  ambient AsyncLocalStorage は Core requirement にしない

Compiler
  Phase 1 core feature
  Graph Manifest + Runtime Linkage Artifact

Application bootstrap
  loutre dev/start/buildがcompile/link後のentryを実行
  raw entryの直接実行はcanonicalではない

Runtime architecture
  not Node-first

Primary Node baseline
  Node.js 26.x

Other runtimes
  latest LTS if official LTS exists
  otherwise latest Stable

Deno baseline 2026-08-24
  2.9.x LTS

Bun baseline 2026-08-24
  1.4.x Stable

Electron baseline 2026-08-24
  43.x Stable

Cloudflare/workerd
  latest compatibility_date
  v0.1 minimum >= 2026-08-04

AWS Lambda baseline 2026-08-24
  managed nodejs24.x
  nodejs26.x 公開後に更新
```

---

**End of Loutre Architecture v0.1 — FROZEN baseline.**
