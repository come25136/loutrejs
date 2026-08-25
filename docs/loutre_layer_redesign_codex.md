# Loutre Layer / Pipeline 再設計 実装指示（Codex向け）

対象リポジトリ: `come25136/loutrejs`
対象ブランチ: `feature/database`

## 0. 最重要前提

**今回は破壊的変更を許可する。後方互換性は不要。**

以下を守ること。

- 旧Layer APIとの互換overloadを作らない
- deprecation shimを作らない
- `layer.compose()` を互換目的で残さない
- `CompositeLayerDescriptor` を互換目的で残さない
- `DatabaseService` を互換目的で残さない
- 旧 `inbound` / `outbound` / `state` APIを残さない
- 旧APIを使うtests/examples/docsは新APIへ更新するか削除する
- 一時的な二重実装は避け、最終形へ直接寄せる
- 「移行しやすさ」より「v0.xのAPIとして一貫していること」を優先する

---

# 1. 背景

`feature/database` ではDatabase対応のために以下が導入されている。

- `@loutrejs/database`
- `DatabaseService`
- ambient transaction
- `CompositeLayerDescriptor`
- `ExecutionScope`
- `layer.compose()`
- recursive child pipeline
- composite layer専用 `inject`
- callback scopeによるtransaction wrapping

recursive pipeline自体は良い方向だったが、Database対応のためにFramework側へDatabase専用の薄い抽象を持ち込んだこと、通常LayerとComposite Layerが分裂したことが問題。

今回の再設計では、Database対応から得られた本当に必要なプリミティブだけをCoreへ残す。

必要なプリミティブは以下。

> Layerがchild pipelineを明示的に囲めること

Database / Transaction / Prisma / Drizzle / ALS等をCoreは知らない。

---

# 2. Freeze済みの設計原則

## 2.1 Layerは1種類だけ

通常Layer / Composite Layer / child-pipeline Layerのような別概念を作らない。

Layerは常に同じもの。

違いは、その出現箇所でchild pipelineを明示するかどうかだけ。

概念:

```text
Layer
├─ static metadata
├─ runtime factory
└─ optional child pipeline at usage site
```

---

## 2.2 Pipelineは再帰構造

PipelineItemとしてLayerを普通に置ける。

```ts
pipeline: [authLayer, validate.body, http.controller]
```

Layerにchild pipelineを明示したい場合は、**Layer自体を関数として呼ぶ**。

```ts
pipeline: [transactionLayer([validate.body, authLayer, http.controller])]
```

重要:

- `transactionLayer` と `transactionLayer([...])` は別種類のLayerではない
- Layerは1種類だけ
- callable syntaxは、その利用箇所にchild pipelineを関連付けるだけ
- `transactionLayer([...])` を呼んだ時点でDI factoryを実行してはいけない
- 内部的には「同じLayer definition + child pipeline」のOccurrence descriptorを作るだけでよい
- `.around()` / `.wrap()` / `.scope()` のような別helperは作らない

## 2.3 nested pipelineはContext scopeではない

child pipelineで追加されたContextは、child終了後も親pipeline後段へ流れる。

例:

```text
parent
  └ layer A
      └ child pipeline
          └ layer B provides B_CONTEXT

child終了
↓
parent後段
↓
B_CONTEXTは利用可能
```

Contextを巻き戻してはいけない。

nested pipelineは以下ではない。

- lexical Context scope
- execution scoped Context storage
- transaction Context scope

単なる構造上のexecution grouping。

Loutreは「transaction clientがcallback中だけ有効」等を知らなくてよい。

---

# 3. 新しいLayer API

最終的にLayer定義は以下の形へ寄せる。

```ts
const someLayer = layer({
  name: 'some',
  requires: [A],
  provides: [B],
  factory: (service = inject(Service)) => {
    return async (ctx, next) => {
      const b = await service.get(ctx.a)

      await next({ b })
    }
  },
})
```

短縮形:

```ts
const someLayer = layer({
  name: 'some',
  requires: [A],
  provides: [B],
  factory:
    (service = inject(Service)) =>
    async (ctx, next) => {
      const b = await service.get(ctx.a)

      await next({ b })
    },
})
```

---

# 4. Layer definitionのstatic metadata

`layer()`の第1引数はLayer definition objectである。`factory`以外のfieldには静的に解析可能な
情報だけを置く。

想定:

```ts
{
  name,
  role?,
  requires?,
  provides?,
  requiresValidated?,
  shortCircuits?,
  factory,
}
```

metadata fieldはfactoryを実行しなくても取得可能であること。

用途:

- Graph
- Pipeline型計算
- requires/provides検査
- validation state
- terminal検査
- short circuit declaration
- CLI graph生成

DI containerを起動しないと `requires` / `provides` 等が分からない設計にしてはいけない。

---

# 5. Layer definition.factory: synchronous factory

`factory` propertyはLayer runtime functionを生成する同期factory。

```ts
layer({
  name: 'some',
  factory: (service = inject(Service)) =>
    async (ctx, next) => {
      ...
    },
})
```

## 5.1 factoryは同期限定

禁止:

```ts
layer({
  name: 'invalid',
  factory: async (service = inject(Service)) => {
    ...
  },
})
```

許可:

```ts
layer({
  name: 'valid',
  factory: (service = inject(Service)) =>
    async (ctx, next) => {
      await ...
    },
})
```

DI解決はconstruction phase。

I/Oや非同期処理はruntime function、Provider lifecycle、Module lifecycle側で行う。

---

# 6. DI設計

## 6.1 DIを `ctx` / `next` の引数列へ混ぜない

禁止:

```ts
async (ctx, next, database) => {}
```

禁止:

```ts
layer({
  inject: [Database],
})
```

新LayerではLayer専用 `inject` metadataを廃止する。

DI方法は通常のLoutre DIへ一本化する。

---

## 6.2 factory default parameterでinjectする

標準形:

```ts
const transactionLayer = layer({
  name: 'transaction',
  factory:
    (database = inject(Database)) =>
    async (_ctx, next) => {
      await database.transaction(next)
    },
})
```

複数DI:

```ts
const authLayer = layer({
  name: 'auth',
  factory: (users = inject(UserService), logger = inject(Logger)) =>
    async (ctx, next) => {
      ...
    },
})
```

この形をfirst-class APIとして扱う。

---

## 6.3 `inject()` はfactory呼び出し時に評価される

JavaScriptのdefault parameterは関数呼び出し時に評価される。

Runtime側ではLayer factoryをInjection Context内で呼び出す。

概念:

```ts
const run = runInInjectionContext(injectionContext, () => factory())
```

factory引数を明示的に渡さないためdefault initializerが評価され、`inject()` が動く。

---

## 6.4 `runInInjectionContext` の責務を一般化

現状の意味:

```text
framework-managed class construction
```

から、

```text
framework-managed synchronous construction
```

へ一般化する。

Layer factoryもframework-managed constructionとして扱う。

---

## 6.5 GraphでLayer -> Provider依存を記録する

現在 `InjectionContext.consumer` / `DependencyRecorder` は `TokenLike` 前提。

新Layerはclass/tokenではないので、consumer概念を一般化すること。

ユーザーにLayer用tokenを作らせてはいけない。

内部的には以下のようなconsumer identityを持たせてよい。

```ts
type DependencyConsumer = TokenLike | LayerConsumer
```

例:

```ts
interface LayerConsumer {
  readonly kind: 'layer-consumer'
  readonly id: string
  readonly name: string
}
```

具体型名は任せる。

Graph上では:

```text
transaction layer
    └─ inject -> Database
```

が出ること。

Graph ProbeでもLayer factoryをInjection Context内で同期実行して `inject()` を記録できるようにする。

---

# 7. Layer runtime function

factoryの返り値:

```ts
async (ctx, next) => {
  ...
}
```

これがLayerの唯一のruntime lifecycle。

削除対象:

```ts
inbound
outbound
state
ExecutionScope
scope.run
```

---

# 8. `requires` の型

metadata:

```ts
requires: [A, SESSION]
```

ならruntime functionでは:

```ts
ctx.a
ctx.session
```

が型安全に利用できること。

重要:

前段pipelineで他のContextが存在していても、`requires` に宣言していないContextはLayerの `ctx` 型へ出さない。

例:

```ts
const foo = layer({
  name: 'foo',
  requires: [SESSION],
  factory: () => async (ctx, next) => {
    ctx.session // OK

    ctx.currentUser
    // Type Error

    await next()
  },
})
```

意味:

```text
requires
= Layerが依存するContext
```

Graph依存関係の正確性も維持する。

---

# 9. `provides` と `next()`

今回の最重要仕様。

## 9.1 providesなし

```ts
const timing = layer({
  name: 'timing',
  factory: () => async (_ctx, next) => {
    await next()
  },
})
```

`next()` は引数なし。

---

## 9.2 providesあり

```ts
const auth = layer(
  {
    name: 'auth',
    provides: [CURRENT_USER],
    factory: () =>
      async (ctx, next) => {
        const user = ...

        await next({
          currentUser: user,
        })
      },
  },
)
```

`next()` の引数としてprovide値を渡す。

---

## 9.3 `next` 型

概念:

```ts
type LayerNext<TProvides extends readonly ContextKey[]> =
  TProvides extends readonly []
    ? () => Promise<void>
    : (provided: ContextProperties<TProvides>) => Promise<void>
```

ただしtuple widening等を考慮して堅牢に実装すること。

---

## 9.4 複数provides

```ts
provides: [CURRENT_USER, CURRENT_TENANT]
```

なら:

```ts
await next({
  currentUser,
  currentTenant,
})
```

を必須にする。

以下はType Error:

```ts
await next()
```

```ts
await next({
  currentUser,
})
```

```ts
await next({
  currentUser: 'wrong',
  currentTenant,
})
```

---

# 10. Context追加タイミング

`next(provided)` 呼び出し時にContextへ追加する。

正確にはcontinuation開始前。

概念:

```ts
const next = async (provided) => {
  applyProvidedContext(layer, context, availableKeys, provided)

  await continuation()
}
```

現行 `applyProvidedContext()` のruntime validationは維持する。

必須:

- 未宣言Context property拒否
- 宣言したContext Key不足検出
- provides内の同名property重複検出
- 既存Context propertyの上書き拒否

---

# 11. Contextは巻き戻さない

以下:

```ts
outerLayer([innerProvider])
```

で `innerProvider` がBをprovideした場合、outer終了後の親pipelineからBを利用可能にする。

```text
before outer
↓
outer
  ↓
  child
    ↓
    +B
↓
outer return
↓
parent continuation
↓
B remains available
```

実Context objectと `availableKeys` をchild/parentで共有してよい。

現行recursive pipelineのこの挙動は維持する。

---

# 12. `next()` のRuntime契約

自由なmiddleware control flowにはしない。

## 12.1 正常経路

通常Layerは `next()` をちょうど1回呼ぶ。

```ts
await next()
```

または

```ts
await next({ provided })
```

---

## 12.2 `next()` 2回は禁止

```ts
await next()
await next()
```

Runtime Error。

エラーコード例:

```text
LUTRE_LAYER_NEXT_REENTRY
```

既存 `LUTRE_LAYER_SCOPE_REENTRY` は削除/置換してよい。

---

## 12.3 `next()` 0回

通常returnで `next()` 0回はRuntime Error。

例:

```text
LUTRE_LAYER_NEXT_SKIPPED
```

ただし後述の `shortCircuit()` を返した場合だけ正常終了。

---

## 12.4 throw時はnext skipped扱いしない

```ts
;async (ctx, next) => {
  throw error
}
```

はそのerrorをそのままPipeline failureとして扱う。

`next()` が呼ばれていないことを追加エラーにしない。

---

## 12.5 downstream errorをLayerが握り潰せない

以下:

```ts
try {
  await next()
} catch {
  // swallow
}
```

をしても、child continuationが失敗していたならRuntimeは元のchild errorを再throwする。

現行Composite runtimeの

```text
scope側がchild errorをcatchしても元errorを保持して再throw
```

という性質を維持する。

これはtransaction wrapper等でも重要。

---

# 13. `shortCircuit`

`shortCircuit` 自体は残す。

`shortCircuits` metadataも現時点では残す。

理由:

- protocol resultの静的宣言
- Graph
- Controller以外のLogical Resultを型追跡

のために利用されている。

ただし旧Layer stateは削除する。

現行:

```ts
ShortCircuit<TResult, TState>
```

から、可能なら:

```ts
ShortCircuit<TResult>
```

へ単純化する。

旧 `inbound` stateを `outbound` へ渡す必要がなくなるため。

---

## 13.1 shortCircuitとnextの排他

正常なLayer終了は原則:

```text
next exactly once
OR
shortCircuit
```

とする。

例:

```ts
if (!user) {
  return shortCircuit(...)
}

await next({
  currentUser: user,
})
```

---

## 13.2 next後のshortCircuitは禁止

禁止:

```ts
await next()

return shortCircuit(...)
```

Runtimeで検出する。

エラー例:

```text
LUTRE_LAYER_SHORT_CIRCUIT_AFTER_NEXT
```

理由:

- child pipelineあり/なしで意味が変わる
- continuationを既に実行した後にPipelineを止める意味が曖昧
- shortCircuitはnextの代替終了として扱う方が単純

---

# 14. request timingのユースケース

新APIで以下が自然に書けること。

```ts
const requestTiming = layer({
  name: 'request.timing',
  factory: () => async (_ctx, next) => {
    const startedAt = performance.now()

    try {
      await next()
    } finally {
      console.log(`${performance.now() - startedAt}ms`)
    }
  },
})
```

これにより `outbound` / Layer stateは不要。

JS lexical scopeを使う。

---

# 15. Prisma transactionのユースケース

Loutre側にPrisma専用コードを書かない。

アプリケーション側のDatabase module例:

```ts
class Database {
  readonly #storage = new AsyncLocalStorage<Prisma.TransactionClient>()

  get client() {
    return this.#storage.getStore() ?? prisma
  }

  async transaction(next: () => Promise<void>): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.#storage.run(tx, next)
    })
  }
}
```

Layer:

```ts
const transactionLayer = layer({
  name: 'transaction',
  factory:
    (database = inject(Database)) =>
    async (_ctx, next) => {
      await database.transaction(next)
    },
})
```

利用:

```ts
pipeline: [transactionLayer([validate.body, authLayer, http.controller])]
```

Loutre coreは以下を知らない。

- Database
- transaction
- commit
- rollback
- Prisma
- Drizzle
- AsyncLocalStorage
- transaction client

---

# 16. Database package方針

`feature/database` の以下の抽象は撤去対象。

- `DatabaseService`
- `DatabaseAdapterSpec`
- Frameworkが定義するtransaction client abstraction
- Frameworkが定義するbegin/savepoint abstraction
- FrameworkDatabase lifecycle
- Database専用transaction Layer abstraction

`packages/database` 自体については、今回の最終成果として有用な汎用APIが残らないなら**packageごと削除してよい**。

「一度追加したpackageだから残す」という理由で残してはいけない。

もし残すなら、Coreの上に載る完全optionalなconvenience packageである必要がある。

ただし第一候補は削除。

Database接続 lifecycle は通常のModule/Provider lifecycleを利用する。

---

# 17. Layerのchild pipeline API

Layer factoryが生成するruntime functionとchild pipelineは分離する。

同じLayerを複数箇所で、異なる範囲を囲う用途に再利用できる必要がある。

例えばtransaction Layerにpipelineを定義時固定してはいけない。

NG:

```ts
const transactionLayer = layer(
  {
    name: 'transaction',
    pipeline: [...],
    factory: ...,
  })
```

同じLayer implementationをProcedureごとに異なる範囲で使えなくなるため。

`layer()` の戻り値は **PipelineItemとして使えるcallable object** にする。

概念:

```ts
interface Layer {
  <const TPipeline extends readonly PipelineItem[]>(
    pipeline: TPipeline,
  ): LayerOccurrence
}
```

具体的なgeneric構造は実装に合わせて調整してよい。

利用:

```ts
pipeline: [transactionLayer([validate.body, http.controller])]
```

通常利用:

```ts
pipeline: [requestTiming, authLayer, http.controller]
```

意味論:

- `transactionLayer` をそのまま置く場合、`next()` はその位置以降のcontinuationを表す
- `transactionLayer([...])` と置く場合、`next()` は指定したchild pipelineだけを表す
- child pipelineが終わり、Layer runtimeがreturnしたら親pipeline後段へ進む
- `transactionLayer([...])` はLayer factoryを再実行しない
- DI factoryはbootstrap/construction時に構築され、runtime functionを保持する
- callable Layerはchild pipeline付きOccurrenceを静的に生成するだけ

Public APIとして以下を追加してはいけない。

```text
.around()
.wrap()
.scope()
layer.compose()
```

# 18. Layer実行意味論

例:

```ts
pipeline: [A([B, C]), D, http.controller]
```

実行:

```text
A runtime
│
└─ next()
   │
   ├─ B runtime
   │  └─ next()
   │     └─ C runtime
   │
   └─ child complete

A returns
↓
D runtime
└─ next()
   └─ http.controller
```

Layerの種類は増えない。

`A([...])` は「AというLayerの、この利用箇所でのchild pipeline」を表すだけ。

# 19. Pipeline type fold

現行 `FoldPipeline` のrecursive性は残す。

ただし `CompositeLayerDescriptor` 特判を廃止し、通常Layer + optional child pipeline occurrenceへ変更する。

型計算:

```text
input state
↓
Layer provides
↓
child pipeline fold
↓
parent next item
```

例:

```ts
pipeline: [A([B]), requiresAAndB]
```

A provides A_CONTEXT、B provides B_CONTEXTなら `requiresAAndB` で両方利用可能にする。

---

# 20. terminal検査

recursive pipeline中のterminal検査を維持する。

対象protocol terminalはdepth-firstでちょうど1つ。

terminalより後ろへPipelineItemを置けない現行保証を維持する。

callable Layerのchild内にterminalがある場合も、親後段との関係を正しく検査すること。

例:

```ts
pipeline: [transactionLayer([http.controller]), foo]
```

はterminal後に `foo` があるためType Error / static diagnostic相当になるべき。

# 21. validation state

`requiresValidated` とValidation Layerのrecursive foldは維持する。

child pipelineでvalidationされたstateはparent後段へ流す。

Contextと同じく巻き戻さない。

---

# 22. Runtime implementationの大幅整理

対象:

```text
packages/runtime/src/pipeline.ts
```

現行:

- `entered` stack
- inbound
- outbound reverse
- `executeComposite`
- `ExecutionScope`
- Layer injection resolution
- scope callback calls count

を大幅に書き換える。

新Runtimeはcontinuationを再帰的に構築する方向が自然。

概念擬似コード:

```ts
async function executeSegment(items, index, state) {
  const item = items[index]

  if (validation) {
    await validate(...)
    return executeSegment(items, index + 1, state)
  }

  if (terminal) {
    return terminal(...)
  }

  const continuation = item.childPipeline
    ? async () => {
        await executePipelineItems(item.childPipeline)
      }
    : async () => {
        await executeSegment(items, index + 1, state)
      }

  await executeLayer(item, continuation)

  if (item.childPipeline) {
    return executeSegment(items, index + 1, state)
  }
}
```

実際にはresult / terminal / shortCircuit / errorsを保持する必要があるため、上記をそのままコピペしないこと。

ただし発想としては:

> Layer runtimeがcontinuationを包む

へ変更する。

`next` はRuntimeが生成する。

---

# 23. next error保持

`next()` が失敗した場合:

```ts
let childFailed = false
let childError: unknown

const next = async (...) => {
  try {
    await continuation()
  } catch (error) {
    childFailed = true
    childError = error
    throw error
  }
}
```

Layer runtimeがcatchして正常returnしても:

```ts
if (childFailed) throw childError
```

する。

現行Compositeのerror swallowing防止ロジックを一般Layerへ統合する。

---

# 24. Layer factory lifecycle

Layer factoryは毎request実行しない。

factoryはapplication construction/bootstrap時に構築してruntime functionを保持する。

理由:

- DI dependencyは通常application providerをcaptureできる
- request固有stateはruntime function内のlocal variableに置く
- 同一runtime functionを並行requestで呼んでも安全な設計を要求する

Layer authorはfactory closureのmutable request stateを持たないこと。

悪い例:

```ts
let startedAt: number

return async (_, next) => {
  startedAt = performance.now()
  await next()
}
```

良い例:

```ts
return async (_, next) => {
  const startedAt = performance.now()
  await next()
}
```

---

# 25. Graph compiler変更

対象候補:

```text
packages/graph/src/graph.ts
packages/graph/src/ir.ts
```

変更内容:

- `CompositeLayerDescriptor` import/分岐削除
- `LayerInjection` 削除
- composite専用dependency edge生成削除
- recursive child pipelineは通常Layer occurrenceとしてvisit
- Layer factoryをprobeして `inject()` dependencyを記録
- Layer node -> provider nodeへ `inject` edgeを生成
- Layer名とpipeline内index pathでstable graph node IDを作る
- child pipelineもrecursiveにGraphへ出す

可能なら「declared」と「probed」の二重DI方式をやめ、Layerについてはfactory probeをsource of truthに寄せる。

---

# 26. DI runtime変更

対象候補:

```text
packages/core/src/injection.ts
packages/runtime/src/di.ts
```

必要変更:

- Injection consumerをTokenLike限定から一般化
- Layer factory用probe/construction APIを追加
- `runInInjectionContext` をclass専用概念から一般化
- existing class DI behaviorは維持
- public `inject()` APIは変えなくてよい

Graph ProbeがLayer factoryを安全に同期実行できること。

---

# 27. Core layer type変更

対象:

```text
packages/core/src/layer.ts
```

削除対象:

```ts
Outcome
ProvidedResult
LayerDescriptor.inbound
LayerDescriptor.outbound
TState
EffectiveLayerState
ExecutionScope
LayerDependency
LayerInjection
InjectedLayerDependencies
CompositeLayerDescriptor
CompositeLayerDefinition
layer.compose
```

`Outcome` が他用途で必要なら別途確認するが、Layer lifecycle専用なら削除。

再設計対象:

```ts
LayerDescriptor
LayerDefinition
PipelineItem
FoldPipeline
ShortCircuit
```

---

# 28. `layer()` の型推論要件

以下で明示型annotation不要であること。

```ts
const layerA = layer({
  name: 'a',
  requires: [A],
  provides: [B],
  factory:
    (service = inject(Service)) =>
    async (ctx, next) => {
      ctx.a
      // Aのvalue型

      const b = await service.get(ctx.a)
      // serviceはService型

      await next({ b })
      // bはBのvalue型
    },
})
```

Type testsを必ず追加すること。

---

# 29. child pipeline call APIの型

Layer自体をcallableにする。

```ts
const occurrence = layerA([child1, child2])
```

`occurrence` はPipelineItemとして扱える内部descriptorでよい。

ただしpublic mental modelとして別種のLayerを露出しない。

必須要件:

- `layerA` 自体もPipelineItemとして使える
- `layerA([...])` もPipelineItemとして使える
- `layerA([...])` はLayer factoryを再実行しない
- child pipelineは利用箇所ごとに異なるものを指定できる
- child pipelineの型情報を保持し、recursive fold / terminal validation / Context propagationへ利用する
- Layerのstatic metadata (`name`, `requires`, `provides`, etc.) はOccurrenceからも追跡可能にする

以下は禁止:

```text
CompositeLayer
ScopeLayer
AroundLayer
layer.compose()
.around()
.wrap()
.scope()
```

Layerそのものを呼ぶ構文だけを提供する。

# 30. basic auth更新

現行 `packages/http/src/basic-auth.ts` は `inbound` と `shortCircuits` を利用している。

新APIへ移植する。

概念:

```ts
return layer(
  {
    name: options.name ?? 'basicAuth',
    role: 'authentication',
    provides: [options.principal],
    shortCircuits: [
      {
        protocol: 'http',
        variant: options.unauthorized.variant,
        response: { status: 401 },
      },
    ],
    factory: () =>
      async (ctx, next) => {
        const credentials = ...

        if (!credentials) {
          return shortCircuit(...)
        }

        const principal = await ...

        if (principal == null) {
          return shortCircuit(...)
        }

        await next({
          [options.principal.name]: principal,
        } as ContextProperties<readonly [TPrincipal]>)
      },
  },
)
```

computed ContextKey型のcast最小化も検討する。

---

# 31. Database branchの整理

`packages/database` 内の現行実装をレビューし、今回の原則と矛盾するものを削除する。

第一候補:

```text
packages/database/
```

をpackageごと削除。

また以下も削除/更新:

- database examples
- database architecture docs
- package references
- workspace references
- tsconfig references
- exports
- tests
- README
- graph tests

ただしrecursive pipelineのtestsはCore/Runtime側へ移して残す。

---

# 32. Tests必須項目

## Type tests

最低限以下。

### requires推論

```ts
requires: [A]
```

で `ctx.a` が利用可能。

requiresしていないContextはType Error。

### providesなし

```ts
next()
```

のみ許可。

### provides 1個

```ts
next({ b })
```

必須。

`next()` はType Error。

### provides複数

全property必須。

型違いNG。

### nested context propagation

child provideがparent後段で利用可能。

### nested validation propagation

child validationがparent後段で有効。

### terminal recursive validation

child terminal後のparent item禁止。

---

## Runtime tests

最低限以下。

### next exactly once

正常。

### next skipped

Runtime Error。

### next twice

Runtime Error。

### throw before next

元error。

### child throw

元error。

### child error swallow attempt

Layerがcatchしても元child errorが再throw。

### shortCircuit without next

正常。

### next + shortCircuit

Runtime Error。

### provided Context追加

後段で取得可能。

### child provided Context

parent後段で取得可能。

### Context overwrite拒否

維持。

### undeclared provide拒否

維持。

### DI factory

default parameter `inject()` が解決される。

### DI graph

Layer -> Service edge生成。

### Prisma風callback wrapper

fake transaction functionで:

```ts
await transaction(async () => {
  await next()
})
```

のenter/exit順が保証される。

### request timing風 finally

child success/errorの両方でfinally実行。

---

# 33. Docs更新

旧設計説明を残さない。

特に:

- Composite Layer
- `layer.compose`
- ExecutionScope
- DatabaseService
- Framework Database abstraction
- inbound/outbound lifecycle

を説明するdocsは削除または全面更新。

新しいLayerの説明は以下を中心にする。

```text
Layer = pipelineの一部分を包むruntime effect
```

ただしReact effect等の用語へ寄せすぎなくてよい。

利用者向けには単純に:

> Layer receives context and next.
> `next()` runs the enclosed continuation.
> `next({...})` additionally provides Context to the continuation and later pipeline.

程度でよい。

---

# 34. Non-goals

今回やらないこと。

- ORM共通API
- Database共通interface
- Prisma adapter
- Drizzle adapter
- transaction isolation抽象
- savepoint抽象
- transaction propagation mode
- execution scoped DI
- request scoped DI
- Context rollback
- middleware short-circuit自由制御
- next result値
- LayerからController resultを読むAPI

---

# 35. 実装順序

推奨順序。

1. `packages/core/src/layer.ts` の新型を作る
2. Type testsで `ctx` / `next(provides)` 推論を成立させる
3. callable Layer (`layerA([...])`) のOccurrence型を作る
4. Pipeline Fold型を新Layer/Occurrenceへ移植
5. Runtime pipelineをcontinuationモデルへ書き換える
6. next契約 / shortCircuit / error semanticsを実装
7. Layer factory construction + Injection Contextを実装
8. Graph ProbeへLayer factory DIを追加
9. HTTP built-in layersを新APIへ移植
10. examples/testsを全面移植
11. `packages/database` を削除
12. database docsを削除/更新
13. unused types/APIの残骸を全削除
14. full test / typecheck / lint
15. graph CLIが新Layer構造を正しく出すことを確認

# 36. 完了条件

以下をすべて満たしたら完了。

- Layerが1種類だけ
- `layer.compose()` が存在しない
- `.around()` / `.wrap()` / `.scope()` が存在しない
- `CompositeLayerDescriptor` が存在しない
- `ExecutionScope` が存在しない
- `inbound` / `outbound` が存在しない
- Layer state genericが存在しない
- Layer専用 `inject:` metadataが存在しない
- Layer factory default parameterで `inject()` できる
- Layer自体を `layerA([...])` と呼んでchild pipelineを持たせられる
- `layerA([...])` でfactory/DI constructionが再実行されない
- `ctx` が `requires` から自動推論される
- `next()` が `provides` から自動推論される
- `next(provided)` でContext追加
- child Contextがparent後段へ伝播
- child validation stateがparent後段へ伝播
- next 0回/2回をRuntime検出
- shortCircuitをnext代替として扱う
- downstream errorをLayerが握り潰せない
- recursive terminal validationが維持される
- GraphにLayer DI dependencyが出る
- Loutre coreにDatabase/Transaction固有概念がない
- `DatabaseService` が削除される
- 不要なら `@loutrejs/database` package自体が削除される
- 全tests/typecheck/lint成功

# 37. 実装時の判断ルール

曖昧な場合は以下を優先する。

1. APIの選択肢を増やさない
2. Framework独自概念を増やさない
3. TypeScript/JavaScriptの自然な機能を利用する
4. Database都合をCoreへ漏らさない
5. Graphで静的構造を失わない
6. 型推論のために利用者へ冗長なgeneric annotationを書かせない
7. backwards compatibilityのために設計を歪めない
8. 旧APIを残すより削除する
9. `next()` の自由度よりPipeline構造の予測可能性を優先する
10. Layerは常に同じ概念として説明できるようにする

---

# 38. 最終的に目指す利用コード

## Auth

```ts
const authLayer = layer(
  {
    name: 'auth',
    role: 'authentication',
    requires: [SESSION],
    provides: [CURRENT_USER],
    factory: (users = inject(UserService)) =>
      async (ctx, next) => {
        const user = await users.find(ctx.session.userId)

        if (!user) {
          return shortCircuit(...)
        }

        await next({
          currentUser: user,
        })
      },
  },
)
```

## Timing

```ts
const requestTiming = layer({
  name: 'request.timing',
  factory: () => async (_ctx, next) => {
    const start = performance.now()

    try {
      await next()
    } finally {
      console.log(`${performance.now() - start}ms`)
    }
  },
})
```

## Transaction

```ts
const transactionLayer = layer({
  name: 'transaction',
  factory:
    (database = inject(Database)) =>
    async (_ctx, next) => {
      await database.transaction(next)
    },
})
```

## Contract

```ts
const UsersContract = contract({
  create: procedure({
    protocols: {
      http: http({
        method: 'POST',
        path: '/users',
        request: {
          body: CreateUserBody,
        },
        responses: {
          created: {
            status: 201,
            body: UserResponse,
          },
        },
        pipeline: [
          requestTiming,

          transactionLayer([validate.body, authLayer, http.controller]),
        ],
      }),
    },
  }),
})
```

このコードを見た利用者が、Database専用Framework APIや別種のLayer概念を理解しなくても動作を説明できる状態を目指す。
