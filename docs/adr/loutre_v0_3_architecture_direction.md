# Loutre v0.3 Architecture Direction

ステータス: Proposed

## Context

Loutre v0.2 までに、portable な Application Definition、Application Graph、Contract / Protocol / Implementation、DI、Task、Trigger、Queue、Runtime Capability、OpenAPI、build / graph / check / explain / doctor といった基礎が揃った。

一方で、HTTP Application を書く体験、Application の解析結果を利用者へ返す体験、Module 境界、client 側の型安全性、性能評価については、既存 Framework から学べる余地が大きい。

比較対象として、主に以下を参照する。

- Hono: 小さい API surface、型伝播、RPC、Standard Schema、multi-runtime
- Fastify: Plugin encapsulation、scope、lifecycle、performance
- Next.js: build-time analysis、diagnostics、CLI / development UX
- NestJS: Module / DI、Devtools、extension model
- ZeltJS: portable Application、Runtime Adapter、backend ecosystem

ただし、Loutre はこれらの Framework と同じ feature set を競うことを目的としない。

Loutre の中心は引き続き次とする。

> **Graph-first, type-safe runtime.**

Application の構造を明示的な Definition と Graph で表現し、Server、Task、Trigger、Queue、Runtime、Tooling、Client を同じ Application model から導出できることを優先する。

## Decision

Loutre v0.3 では、以下の 5 項目を architecture 上の優先事項とする。

1. Contract-derived typed client
2. HTTP Standard Schema の一貫化
3. Graph を利用した build / diagnostics UX
4. Module visibility / encapsulation の厳格化
5. 再現可能な benchmark infrastructure

これらを実現するために必要な場合、v0.x では Public API の破壊的変更を許容する。

互換 layer や deprecated alias を積み重ねて architecture を複雑化するより、v0.x の段階で canonical API を一本化する。

---

## 1. Contract-derived typed client

HTTP client の型は Handler / Implementation の `typeof` から導出しない。

Loutre では Contract を server / client 双方の source of truth とする。

```text
                  Contract
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
  Implementation   OpenAPI    Typed Client
        │
        ▼
 Application Graph
```

Contract は少なくとも、request、response、status / variant、protocol metadata を保持する。

Typed Client は Contract の wire-level contract から input / output を導出する。

Implementation の具体的な class、factory result、handler function の型は client Public API に漏らさない。

### 理由

Hono RPC のように server 側の型から client 型を得られる体験は有用である。

ただし Loutre では Implementation ではなく Contract が既に独立した概念として存在する。Implementation 型から client contract を逆算すると、Contract と Implementation の責務が再び結合する。

Contract を source of truth とすることで、同じ定義から以下を導出できる。

- server typing
- runtime validation
- typed client
- OpenAPI
- mock / test fixture
- Application Graph

### Public API 方針

具体的な API 名は実装時に決定するが、以下のいずれかを canonical にする。

```ts
const client = createClient(UsersContract, transport)
```

または Application 単位で client surface を生成する。

```ts
const client = createClient(applicationContract, transport)
```

code generation を導入する場合も、生成元は Application Graph と Contract とする。

---

## 2. HTTP Standard Schema の一貫化

Environment / Arguments と同様に、HTTP request / response validation も Standard Schema を canonical boundary とする。

```text
Environment ─┐
Arguments ───┤
HTTP params ─┤
HTTP query ──┤
HTTP headers ┤ Standard Schema
HTTP body ───┤
HTTP response┘
```

特定の schema library 専用 DSL は Core に追加しない。

Zod、Valibot、ArkType 等の選択は Application 側へ残す。

OpenAPI が必要な場合のみ、既存 ADR のとおり Standard JSON Schema capability を追加で要求する。

### 理由

validation library を Framework の public model に組み込むと、Application portability と schema ecosystem の独立性が失われる。

また Environment / Arguments / HTTP が異なる validation abstraction を持つ理由もない。

---

## 3. Graph-driven build / diagnostics UX

Application Graph を内部 representation に留めず、Framework の主要な developer experience として利用する。

`loutre build`、`loutre doctor`、`loutre explain`、`loutre graph` は同じ Graph semantics を共有する。

### Build summary

`loutre build` は artifact path だけでなく、Application の主要な解析結果を簡潔に表示できるようにする。

例:

```text
Loutre Application

Executions
├ HTTP
│  ├ GET  /users
│  └ POST /users
├ Task
│  └ users.rebuild-index
└ Trigger
   └ users.cleanup [cron]

Runtime
├ Target        Cloudflare Workers
├ Required      fetch, crypto
└ Compatible    yes

Graph
├ Modules       4
├ Providers     17
├ Implementations 6
└ Diagnostics   0
```

通常出力は簡潔に保ち、詳細な理由は明示的な debug / explain surface へ分離する。

### Explain

`explain` は単なる node 情報表示ではなく、Graph 上の理由を説明できることを目標とする。

例:

```text
UsersController
→ UsersService
→ UsersRepository
→ PostgresDatabase
→ tcp capability
```

Runtime compatibility failure では、missing capability だけでなく、その capability を要求した dependency path を示せるようにする。

### Doctor

`doctor` は Runtime Capability check に加えて、issue report に利用できる Application / Runtime 情報を出力できるようにする。

対象には以下を含める。

- Loutre version
- Runtime / platform
- TypeScript version
- Application Graph validity
- execution summary
- required / missing capability
- Environment / Arguments contract の成立状態

### Graph visualization

将来 `graph --format html` のような static explorer を追加できる設計にする。

Runtime に inspection server を立てることを必須にしない。

Application Graph が既に存在するため、visualization のために runtime introspection を architecture の中心へ追加しない。

---

## 4. Module visibility / encapsulation

Module の `exports` を単なる metadata ではなく、dependency visibility の正式な境界として扱う。

```text
UsersModule
├ private
│  ├ UsersRepository
│  └ InternalUserMapper
│
└ exports
   └ UsersService
```

別 Module から private Provider を参照した場合、Graph compile 時に拒否する。

```text
BillingModule → UsersRepository   invalid
BillingModule → UsersService      valid
```

Graph IR は Provider / Contract 等について declaring Module と visibility を追跡できるようにする。

`explain` は visibility violation について、宣言元、export 状態、参照元を説明できるようにする。

### 理由

大規模 Application では DI token の解決可否だけでは architecture boundary として弱い。

Fastify の encapsulation や NestJS Module exports が示しているように、Framework が scope boundary を持つことで local reasoning が可能になる。

Loutre ではこれを decorator metadata や runtime container rule ではなく、Application Graph の semantic validation として表現する。

---

## 5. Benchmark infrastructure

Loutre の性能評価は README 用の単一 requests/sec 数値ではなく、再現可能な benchmark suite として管理する。

最低限、以下を測定対象とする。

- HTTP throughput
- p50 / p95 / p99 latency
- cold start
- Application bootstrap
- memory usage
- bundle size
- route / execution registration scale
- DI resolution overhead
- Graph compile / probe cost

比較対象は少なくとも次を含める。

- Hono
- Fastify
- NestJS
- ZeltJS
- Express
- Loutre

公開する場合は、Framework ごとに有利な条件を選ぶのではなく、実行環境、runtime version、route 内容、validation の有無、warm-up、測定方法を repository 上で再現可能にする。

Benchmark の結果自体は architecture contract としない。

Performance regression を検出できる infrastructure を持つことを決定とする。

---

## Explicitly rejected directions

v0.3 では以下を canonical architecture として採用しない。

### Decorator-first API

`@Controller`、`@Injectable`、`@Module` 等を Application Definition の canonical API にしない。

Decorator metadata から Graph を復元するのではなく、明示的な TypeScript descriptor から Graph を構築する。

Decorator sugar を将来追加する余地まで否定しないが、Core / Graph / Runtime が decorator metadata に依存してはならない。

### Filesystem discovery / filesystem routing

Application entry、Module、Controller、route を filesystem layout から自動発見しない。

Project generator が推奨 directory structure を生成することと、Framework runtime / compiler が filesystem を source of truth にすることは分離する。

Application Definition を唯一の composition root とする。

### Request-scoped DI

request、current user、tenant、permission、session 等の execution data を Provider scope として DI container へ入れない。

静的 dependency は DI、execution data は typed Context という境界を維持する。

### Ambient request state

`currentUser()`、`currentRequest()` のように ambient state から execution data を取得する API を canonical にしない。

必要な execution data は procedure Context / Context Key / Pipeline を通して明示する。

### Async construction

Provider factory、Implementation factory、Task factory 等の synchronous construction policy を維持する。

network connection や long-running initialization は Lifecycle へ分離する。

Graph Probe を成立させるために、construction 中へ arbitrary async side effect を許容しない。

### Implicit compiler magic

directive や filesystem convention によって Application topology、cache semantics、runtime capability が暗黙に変化する設計を避ける。

最適化は Application Graph と build target から導出してよいが、Application semantics 自体は Definition から追跡可能でなければならない。

### Package proliferation

機能追加ごとに `@loutrejs/*` package を増やすことを既定にしない。

まず Core primitive、Protocol、Layer、Binding、example / recipe で表現できるかを検討する。

独立した release boundary、dependency boundary、runtime dependency が必要な場合だけ package 分割する。

### Handler-derived contract

Implementation / Handler の `typeof` を public API contract の source of truth にしない。

型安全な client experience は採用するが、その型は Contract から導出する。

---

## Runtime specialized build

Hono の runtime-specific preset のような最適化方針は参考にするが、利用者へ preset 選択を要求することは canonical にしない。

```text
Application Graph
      │
      ▼
Runtime Capability Analysis
      │
      ▼
Target-specific Build
```

`loutre build --runtime <target>` が target を知っている場合、不要な execution / protocol / adapter を artifact から除外する余地を持たせる。

ただし tree shaking / artifact optimization の具体方式は本 ADR では固定しない。

---

## Observability

Tracing、Metrics、Error Reporting 等の bootstrap point は必要になるが、Application Definition 内の arbitrary process-global side effect として扱わない。

Observability の起動責務は Host / Runtime lifecycle 側へ置く。

```text
Application Definition
       │
       ▼
      Host
       │
       ├ Observability
       │
       ▼
Application Runtime
```

具体 API は別 ADR で決定する。

---

## Breaking change policy

本 ADR を実装する過程では、以下の条件を満たす場合に v0.x Public API の破壊的変更を許容する。

- canonical model を一本化できる
- deprecated compatibility layer を長期維持せずに済む
- Application Graph の semantics が単純になる
- runtime-specific exception を減らせる
- type-level invariant を強くできる

既存 API を残すこと自体を目的にしない。

一方で、破壊的変更には必ず migration path を release note / documentation に記載する。

---

## Implementation order

v0.3 の実装順は原則として次とする。

```text
1. HTTP Contract / Standard Schema の canonical model を確定
2. Contract-derived typed client
3. Module visibility semantics を Graph IR へ追加
4. build / doctor / explain の Graph diagnostics を強化
5. benchmark infrastructure を追加
```

理由は、Typed Client と diagnostics の双方が安定した Contract / Graph semantics に依存するためである。

Implementation 中に Graph IR の変更が必要な場合、旧 IR との互換 bridge を恒久的に維持することは求めない。

---

## Consequences

### Positive

- Loutre の差別化が「機能数」ではなく Application model の一貫性になる
- Contract から Server / Client / OpenAPI を同時に導出できる
- Runtime compatibility failure を dependency path とともに説明できる
- Module boundary を compile 時に検証できる
- multi-runtime 最適化を Application Graph から行える
- Framework magic を増やさず developer experience を改善できる

### Negative

- 単純な CRUD だけを見ると decorator-first Framework より記述量が多くなる可能性がある
- Graph IR が保持する semantic metadata が増える
- v0.3 では Public API の破壊的変更が発生し得る
- Typed Client を追加すると Contract の型設計により高い安定性が要求される
- Benchmark suite の保守コストが増える

これらは、Loutre を小さい HTTP router として最適化するのではなく、portable Application Framework として育てるための意図した trade-off とする。

## References

- Hono Documentation: https://hono.dev/docs/
- Fastify Documentation: https://fastify.dev/docs/latest/
- Next.js Documentation: https://nextjs.org/docs
- NestJS Documentation: https://docs.nestjs.com/
- ZeltJS: https://github.com/zeltjs/zelt
