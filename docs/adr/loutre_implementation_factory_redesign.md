# Loutre Implementation Factory 再設計 実装指示（Codex向け）

対象リポジトリ: `come25136/loutrejs`
対象ブランチ: `develop`

---

# 0. 最重要前提

このタスクは、直前の **「Loutre HTTP Path / Params / Route Identity 再設計」** が完了し、`develop` に反映された状態を前提とする。

実装開始時に必ず最新 `develop` を取得し、実際のコードを確認してから変更すること。

直前タスクでは少なくとも以下が成立済みである前提とする。

```txt
path = raw params structure の source of truth
params schema map = property-wise refinement
pipeline = refinement boundary
dispatchKey = protocol dispatch identity
```

HTTPでは概念的に以下が成立していること。

```txt
GET /users/{userId}/posts/{postId}
        ↓
/users/{}/posts/{}
        ↓
http:GET:/users/{}/posts/{}
```

また `ProtocolDescriptor` は `dispatchKey` を正式概念として持ち、HTTP route duplicate は同一Contractでは `contract()`、Application全体ではGraph compileで検出される前提とする。

今回のImplementation factory化で、これらを旧設計へ戻してはいけない。

特に以下は禁止。

- HTTP path / params APIを旧仕様へ戻す
- regex-based route matcherを復活させる
- route registration order依存へ戻す
- `dispatchKey` をoptional metadataへ戻す
- GraphにHTTP path grammarを持ち込む
- Implementation側でHTTP route identityを再計算する
- 前段タスクの互換shimを追加する

前段タスクでは意図的に `DI` / `message-port semantics` 等をscope外としていたが、**その制約は前段タスクだけのもの**である。

今回のタスクではImplementation abstractionをprotocol-neutralに作り直すため、以下は明示的に変更対象となる。

```txt
core
module
injection context
runtime DI
ApplicationRuntime
Graph Probe
HTTP terminal dispatch
MessagePort terminal dispatch
examples
tests
documentation
```

---

# 1. 今回も後方互換性は不要

Loutreはまだv0.x設計段階である。

今回も最終形へ直接寄せる。

以下の互換対応は不要。

```txt
implement(...)
ImplementationBinding
class Controllerをcanonical APIとして維持
class Handlerをcanonical APIとして維持
resolveImplementation(Class)
legacy overload
compatibility shim
deprecated alias
```

古いAPIを残して二重モデルにしないこと。

最終的にImplementationは1種類だけにする。

---

# 2. 背景

現在のLoutreではLayerがすでに以下のモデルへ移行している。

```txt
Layer
├─ static metadata
└─ synchronous factory
     └─ runtime function
```

例:

```ts
const authLayer = layer({
  name: 'auth',

  factory:
    (auth = inject(AuthService)) =>
    async (ctx, next) => {
      // ...
      await next()
    },
})
```

一方、Contract implementationだけはまだclassを前提としている。

概念的には現在:

```ts
class UsersController implements UsersHttp {
  constructor(readonly users = inject(UsersService)) {}

  async get(ctx: ContextOf<UsersHttp, 'get'>) {
    // ...
  }
}

implement(UsersContract).for(http).with(UsersController)
```

となっている。

この構造には二重宣言がある。

```txt
Controller class
  ↓ TypeScript上ではContract shapeを知る

implement(Contract).for(protocol).with(Class)
  ↓ Runtime用に同じ関係を再宣言
```

さらにFramework内部ではImplementationだけが、

```txt
Class
new Target()
prototype method inspection
Class-keyed cache
```

というLayerと異なるconstruction modelを持つ。

今回これを廃止する。

---

# 3. Freezeする設計原則

最重要原則:

> **Contract Implementationはclassではなく、static descriptor + synchronous factoryで表現する。**

さらに:

> **Loutreのframework-managed executable componentは、明示的なdescriptorとfactoryを基本形とする。**

今回の範囲では少なくとも:

```txt
Layer
├─ static metadata
└─ factory

Implementation
├─ static metadata
└─ factory
```

という対称性を成立させる。

classはLoutreの中心概念ではない。

classはProvider実装手段の1つとして残ってよい。

```txt
Provider
  ├ useClass
  ├ useFactory
  ├ useValue
  └ conditional

Layer
  └ factory

Implementation
  └ factory
```

Controller / Handlerだけを特別にclass化しない。

---

# 4. 新しいPublic API

canonical APIを以下へ変更する。

```ts
export const UsersController = implementation({
  name: 'UsersController',

  contract: UsersContract,
  protocol: http,

  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: {
          id: ctx.params.id,
          name: 'test',
        },
      })
    },

    async create(ctx) {
      return ctx.response.created({
        body: users.create(ctx.body.name),
      })
    },
  }),
})
```

Module:

```ts
export const UsersModule = defineModule(() => ({
  providers: [UsersService],

  implementations: [UsersController],
}))
```

これを最終形とする。

---

# 5. `implementation()` はprotocol-neutral

`implementation()` は `@loutrejs/loutre` の概念とする。

HTTP専用の:

```ts
controller(...)
```

はcoreに追加しない。

MessagePort専用の:

```ts
handler(...)
```

もcoreに追加しない。

同じAPIでProtocolを差し替える。

HTTP:

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: () => ({
    // ...
  }),
})
```

MessagePort:

```ts
const UsersHandler = implementation({
  name: 'UsersHandler',
  contract: UsersContract,
  protocol: messagePort,
  factory: () => ({
    // ...
  }),
})
```

`Controller` / `Handler` は変数名・アプリケーション上の呼称として使ってよい。

Framework coreの別概念にはしない。

---

# 6. 新しいImplementation descriptor

`ImplementationBinding` は廃止する。

代わりに概念として:

```ts
export interface ImplementationDescriptor<
  TContract extends ContractDefinition = ContractDefinition,
  TProtocol extends string = string,
  TProcedures extends readonly string[] = readonly string[],
  TRuntime extends object = object,
> {
  readonly kind: 'implementation'
  readonly name: string
  readonly contract: TContract
  readonly protocol: TProtocol
  readonly procedures: TProcedures
  readonly factory: () => TRuntime
}
```

相当を導入する。

実際の型設計はTypeScript推論品質を優先して調整してよい。

重要なのは以下。

```txt
kind
name
contract
protocol
procedures
factory
```

がfactoryを実行しなくても取得できるstatic metadataであること。

---

# 7. declaration input と canonical descriptor を分けて考える

ユーザー入力では:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: ...,
})
```

と `ProtocolFactory` を渡す。

返されるdescriptorではprotocol identityをcanonicalなstringへnormalizeする。

概念:

```ts
{
  kind: 'implementation',
  name: 'UsersController',
  contract: UsersContract,
  protocol: 'http',
  procedures: ['get', 'create'],
  factory,
}
```

Module / Graph / Runtime / protocol adaptersは、このcanonical descriptorだけを扱う。

各consumerが毎回:

```ts
protocol.protocol
```

や、

```ts
procedures ?? discoverProcedures(...)
```

を処理する設計にしない。

---

# 8. `procedures` はdefinition時にnormalizeする

全procedureを実装する通常ケース:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: () => ({
    async get(ctx) {
      // ...
    },

    async create(ctx) {
      // ...
    },
  }),
})
```

`procedures` を省略した場合、`implementation()` 呼び出し時に:

```txt
Contract
  ↓
指定protocolを持つprocedureだけ抽出
  ↓
canonical readonly procedures
```

へnormalizeする。

返却descriptorの `procedures` は必ず具体的なreadonly listとする。

つまりFramework内部では:

```ts
implementation.procedures
```

だけを読む。

`undefined` fallbackを各所へ残さない。

---

# 9. partial Implementation

既存 `.procedures(...)` 相当はplain propertyにする。

```ts
export const GetUserController = implementation({
  name: 'GetUserController',

  contract: UsersContract,
  protocol: http,

  procedures: ['get'],

  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      // ...
    },
  }),
})
```

要件:

- `procedures` のliteral unionを保持する
- `as const` をユーザーへ要求しない
- `const` type parameter等を利用してよい
- 指定されたprocedureだけfactory resultへ要求する
- protocolに存在しないprocedure名はcompile-time reject
- unsafe cast / JavaScript対策としてruntimeでも不正procedureをreject
- 同じprocedure名を重複指定した場合はruntime definition errorとしてよい
- partial implementation coverageの既存Graph semanticsを維持する

---

# 10. `ctx` を完全に自動推論する

canonical usageでは以下を不要にする。

```ts
type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UsersController implements UsersHttp {
  async get(ctx: ContextOf<UsersHttp, 'get'>) {
    // ...
  }
}
```

新API:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: () => ({
    async get(ctx) {
      // ctx は自動推論
    },
  }),
})
```

`ctx` の型は:

```txt
Contract
  ↓
procedure
  ↓
selected protocol
  ↓
ProtocolDescriptor<TProtocol, TContext, TResult, ...>
  ↓
TContext
```

からcontextual typingする。

HTTP固有のctx型計算をcoreへ持ち込んではいけない。

coreは `ProtocolDescriptor` のcontext/result genericだけを見る。

---

# 11. 前段HTTP再設計後のparams型推論を壊さない

直前タスク完了後、HTTP path paramsはpath自体からraw型を得る。

例えば:

```ts
const UsersContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{id}',

        responses: {
          found: {
            status: 200,
            body: User,
          },
        },

        pipeline: [http.controller],
      }),
    },
  }),
})
```

Implementation:

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: () => ({
    async get(ctx) {
      ctx.params.id
      // string
    },
  }),
})
```

`request.params` schema map + `validate.params` がある場合:

```ts
http({
  method: 'GET',
  path: '/users/{id}',

  request: {
    params: {
      id: z.coerce.number(),
    },
  },

  responses: {
    found: {
      status: 200,
      body: User,
    },
  },

  pipeline: [validate.params, http.controller],
})
```

なら:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: () => ({
    async get(ctx) {
      ctx.params.id
      // number
    },
  }),
})
```

この自動推論をtype testで必ず確認する。

Implementation factory化のために `ControllerOf` の旧型経路へ戻してはいけない。

---

# 12. return resultもProtocolDescriptorから検査する

factoryが返す各procedure functionは:

```ts
;(context: TContext) => TResult | Promise<TResult>
```

を満たすこと。

概念型:

```ts
type ProcedureNamesForProtocol<
  TContract extends ContractDefinition,
  TProtocol extends string,
> = {
  [
    K in keyof ContractProcedures<TContract>
  ]: TProtocol extends keyof ContractProcedures<TContract>[K]['protocols']
    ? K
    : never
}[keyof ContractProcedures<TContract>] &
  string
```

```ts
type ImplementationRuntimeShape<
  TContract extends ContractDefinition,
  TProtocol extends string,
  TProcedures extends string,
> = {
  [K in TProcedures]: ContractProcedures<TContract>[K]['protocols'][TProtocol &
    keyof ContractProcedures<TContract>[K]['protocols']] extends ProtocolDescriptor<
    TProtocol,
    infer TContext,
    infer TResult,
    any
  >
    ? (context: TContext) => TResult | Promise<TResult>
    : never
}
```

`ProtocolDescriptor` のgeneric数は前段HTTP再設計後の実コードへ合わせること。

ここに示した型を文字通りコピーする必要はない。

満たすべき意味論がsource of truth。

---

# 13. `ControllerOf` / `ContextOf` は即削除しなくてよい

HTTP packageの:

```txt
ControllerOf
ContextOf
```

MessagePort packageの:

```txt
HandlerOf
MessageContextOf
```

はadvanced type utilityとして残してよい。

ただしcanonical examples / READMEでは、新しい `implementation()` contextual typingを優先する。

つまり:

```txt
残してよい
≠
通常利用で要求する
```

新APIの利用者がControllerを書くためだけに型aliasを作る必要がない状態を完成条件とする。

---

# 14. Implementation factoryは同期限定

Layer factoryと同じ意味論にする。

合法:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: await users.get(ctx.params.id),
      })
    },
  }),
})
```

ここでasyncなのはprocedure runtimeであり合法。

factory自体は同期。

禁止:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: async () => ({
    async get(ctx) {
      // ...
    },
  }),
})
```

runtimeでもthenableをrejectする。

推奨error:

```txt
LUTRE_IMPL_ASYNC_FACTORY
Implementation UsersController factory must be synchronous.
```

---

# 15. factoryはdependency wiringだけを行う

Implementation factoryはGraph Probeでも実行される。

また通常runtime constructionでも実行される。

したがってfactory bodyは同期かつ副作用のないdependency wiringであることを前提にする。

推奨:

```ts
factory: (users = inject(UsersService), audit = inject(AuditService)) => ({
  // ...
})
```

factory内で避けるもの:

```txt
DB connect
network I/O
filesystem I/O
timer start
subscription start
business operation
request-dependent operation
```

resource lifecycleが必要ならProvider + lifecycleへ置く。

これはLayer factoryと同じ原則。

---

# 16. factoryは複数回実行され得る

重要。

同じdescriptorのfactoryでも:

```txt
Graph Probe
Runtime construction
```

では別々に実行され得る。

したがって:

> factoryを1 application process中に絶対1回しか呼ばれない関数として設計してはいけない。

一方、1つの実際のApplicationRuntime内ではfactory resultをapplication lifetimeでcacheし、procedure invocationごとに再生成しない。

---

# 17. Implementation runtime result

factoryはselected proceduresを持つobjectを返す。

概念:

```ts
{
  get(ctx) {
    // ...
  },

  create(ctx) {
    // ...
  },
}
```

runtime unsafe input対策として以下を検査する。

- thenableではない
- non-null objectである
- 最低限selected procedureがcallable
- missing procedureはGraph/runtime validation error

primitiveはreject。

```txt
LUTRE_IMPL_FACTORY_RESULT
```

相当の明確なerrorを用意してよい。

---

# 18. Implementationはapplication lifetime

Implementationにscope optionを追加しない。

禁止:

```ts
implementation({
  scope: 'transient',
  // ...
})
```

Implementation factory resultはApplicationRuntimeごとに1つ。

概念:

```txt
ApplicationRuntime
  ↓
Implementation factory
  ↓
runtime object
  ↓
cache
  ↓
全request / invocationで共有
```

request / message固有データはすべて `ctx` に置く。

---

# 19. ImplementationをLifecycle participantにしない

現在もController implementation instanceはProvider lifecycleの管理対象ではない。

この意味論を維持する。

factory resultに偶然:

```ts
{
  onModuleInit() {},
  get() {},
}
```

があっても、Implementation runtimeをProvider lifecycle participantとして自動登録しない。

Lifecycleが必要なresourceはProviderとして宣言する。

責務:

```txt
Provider
  → resource / lifecycle

Implementation
  → protocol procedure execution
```

を維持する。

---

# 20. ImplementationはDI tokenではない

ImplementationDescriptor自体を:

```ts
inject(UsersController)
```

できるようにしない。

Implementation runtimeも暗黙Provider登録しない。

Controller/Handler間の共有ロジックはService Providerへ抽出する。

ImplementationはApplication Graph上のexecution targetであり、DI dependency targetではない。

---

# 21. Module API

`ModuleDefinition` を:

```ts
readonly implementations?:
  readonly ImplementationDescriptor[]
```

相当へ変更する。

旧:

```ts
readonly implementations?:
  readonly ImplementationBinding[]
```

は削除。

Module利用側:

```ts
defineModule(() => ({
  providers: [UsersService],

  implementations: [UsersController, AdminController],
}))
```

だけでよい。

ModuleはContractとのbindingを再宣言しない。

---

# 22. `implement()` を削除する

以下をPublic APIから削除。

```txt
implement
ImplementationBinding
```

旧:

```ts
implement(UsersContract).for(http).with(UsersController)
```

旧partial:

```ts
implement(UsersContract).for(http).procedures('get').with(GetUserController)
```

は全て新APIへ移行する。

互換overload / aliasは不要。

---

# 23. `implementation()` はfactoryをdefinition時に実行しない

以下の時点ではfactoryを実行しない。

```txt
module import
implementation({...}) call
defineModule(...)
```

`implementation()` はstatic descriptorを作るだけ。

これはLayer definitionと同じ。

factory executionはFramework-managed construction / Graph Probe時のみ。

---

# 24. Runtime Container

現在のclass-based implementation cache:

```ts
#implementationCache =
  new Map<Class, unknown>()
```

を廃止する。

新しく概念的に:

```ts
#implementationCache =
  new Map<ImplementationDescriptor, object>()
```

とする。

descriptor object identityでcacheしてよい。

name stringだけをcache keyにしてはいけない。

異なるImplementationが同じ `name` を持つ可能性だけでidentity collisionしないこと。

---

# 25. Runtime API

class-based:

```txt
resolveImplementation(Class)
```

を削除する。

代わりに少なくとも概念として:

```txt
prepareImplementation(descriptor)
implementationRuntime(descriptor)
probeImplementation(descriptor, consumer)
```

相当を導入する。

命名は既存Runtime APIとの一貫性を優先して微調整してよい。

推奨意味論:

```ts
prepareImplementation(
  implementation,
): void
```

- Application construction時にfactoryを同期実行
- resultをcache
- 同じdescriptorなら二重constructionしない

```ts
implementationRuntime(
  implementation,
): object
```

- prepare済みruntimeを返す
- 未prepareなら明示error

```ts
probeImplementation(
  implementation,
  consumer,
): object
```

- Graph Probe用
- production cacheへ保存しない
- inject edgeをrecordする

---

# 26. Layer Runtimeとconstruction思想を揃える

現在のLayer:

```txt
preparePipeline()
  ↓
#constructLayer()
  ↓
runInInjectionContext(...)
  ↓
layer.factory()
```

Implementationも:

```txt
prepareImplementation()
  ↓
#constructImplementation()
  ↓
runInInjectionContext(...)
  ↓
implementation.factory()
```

へ揃える。

ただし実装直後から無理に巨大な共通generic helperへ抽象化する必要はない。

まず意味論を一致させる。

重複が明確かつ安全に除去できる場合だけinternal helper化してよい。

---

# 27. Application construction時にImplementationをprepareする

`ApplicationRuntime` constructionでModule graphを収集後、すべてのImplementation factoryをprepareする。

概念:

```ts
for (const module of runtimeGraph.modules) {
  for (const implementation of module.definition.implementations ?? []) {
    container.prepareImplementation(implementation)
  }
}
```

Layerと同様、Provider objectがLifecycle前にresolveされること自体は許容する。

factoryではdependency wiringしかしないため、Providerのresource initializationは後続Lifecycleで行われる。

---

# 28. selected proceduresだけを見る

ApplicationRuntimeがPipeline preparation対象を収集する際は:

```ts
implementation.procedures
```

だけを見る。

Contract内の同protocol全procedureを無条件に走査しない。

partial implementationのdescriptorはselected procedureのpipelineだけに対応する。

ただし同一pipeline descriptorが複数箇所から見つかった場合、Layer cache semanticsに従って安全にprepareする。

---

# 29. Injection ContextへImplementation consumerを追加

現在のDependency consumerにはclass token / Layer consumer等がある。

Implementation factory化後はclass tokenでは表現できないため、Implementation consumerを第一級化する。

概念:

```ts
export interface ImplementationConsumer {
  readonly kind: 'implementation-consumer'
  readonly id: string
  readonly name: string
}
```

```ts
export type DependencyConsumer =
  TokenLike | LayerConsumer | ImplementationConsumer
```

相当。

実際の型配置は循環依存を避けて調整してよい。

重要なのは:

```txt
Implementation → injected Provider
```

edgeをImplementation node起点として正しくrecordできること。

class tokenへ偽装しない。

---

# 30. consumer identityをnameだけに依存させない

以下は禁止。

```txt
consumer id = implementation.name
```

nameは表示labelであって完全identityではない。

Graph node IDはcollision-safeにする。

Graph ProbeではContract / protocol / module registration等の既存Graph contextからstableなconsumer IDを構築してよい。

Production runtimeのconsumer IDはdiagnostic用途中心でよいが、Graph Probeのedge identityを壊さないこと。

---

# 31. `probeClass()` は全部消さない

重要。

Providerでは引き続きclassを利用できる。

したがって:

```txt
probeClass()
```

自体を必ず削除する必要はない。

削除するのは:

```txt
Implementationをclassとしてprobeする処理
```

である。

最終的に:

```txt
Provider class
  → probeClass()

Layer
  → probeLayer()

Implementation
  → probeImplementation()
```

となる。

---

# 32. Graph Probe

現在Implementation classをmanaged class集合へ追加し:

```txt
probeClass(ImplementationClass)
```

している処理を廃止する。

新しくImplementation descriptorごとにfactoryをprobeする。

概念:

```txt
ImplementationDescriptor
  ↓
probeImplementation()
  ↓
runInInjectionContext()
  ↓
factory()
  ↓
inject(Service)
  ↓
Implementation node → Service node
```

依存edgeは:

```txt
kind: inject
source: probed
```

等、既存Graph IR semanticsと整合させる。

---

# 33. Graph ProbeではImplementation factoryをprocedureごとに呼ばない

1 descriptorが:

```ts
procedures: ['get', 'create']
```

を持つ場合でもfactory constructionは1回。

```txt
descriptor
  ↓
factory()
  ↓
runtime object
  ├ get
  └ create
```

とする。

Graph validationでprocedure callableを確認するときは同じprobe resultを利用する。

procedureごとにfactoryを再実行しない。

---

# 34. Graph node

Implementation dependency nodeは引き続き:

```txt
kind: implementation
```

として表現する。

labelは:

```txt
implementation.name
```

を利用してよい。

ただしnode IDはcollision-safe。

class token nodeとして表現しない。

ImplementationがclassではなくなってもApplication Graph上の概念は消さない。

むしろ明示descriptor化によって第一級にする。

---

# 35. GraphのImplementation IR

既存 `ImplementationIR` が概念的に:

```txt
contract
procedure
protocol
implementation
method
```

を持っている場合、必要以上にshapeを壊さなくてよい。

`implementation` 表示名は:

```ts
descriptor.name
```

から取得する。

`method` はselected procedure名。

つまり:

```txt
UsersContract
get
http
UsersController
get
```

というGraph出力は維持可能。

class名取得へ依存しないこと。

---

# 36. prototype inspectionを削除

旧Graph validation:

```ts
binding.implementation.prototype[procedure]
```

のようなclass prototype inspectionは削除する。

新しくfactory probe resultを検査。

概念:

```ts
const runtime =
  probeImplementation(...)

for (
  const procedure
  of implementation.procedures
) {
  if (
    typeof runtime[procedure]
      !== 'function'
  ) {
    // diagnostic
  }
}
```

既存 `LUTRE_IMPL_004` 等のdiagnostic codeを合理的に再利用してよい。

messageはclass前提表現からdescriptor/runtime前提へ修正する。

---

# 37. factory invalid resultのGraph diagnostic

unsafe cast / JavaScript等でfactoryが:

```txt
Promise
null
number
missing method object
```

を返した場合、Graph compile / runtime constructionのどちらでも明確に失敗できること。

Graph compileでは可能な限りdiagnosticへ変換する。

runtime direct useでもfail-fastする。

---

# 38. Graphは`dispatchKey`をそのまま使う

前段HTTP再設計後、route identityはProtocol descriptorの:

```ts
dispatchKey
```

にある。

Implementation factory化ではこれを変更しない。

Graph target作成時は:

```txt
Contract procedure
  ↓
selected protocol descriptor
  ↓
dispatchKey
```

を読む。

Implementation descriptor側に:

```txt
routeKey
path
method
normalizedPath
```

等を追加しない。

Implementationはrouting metadataのsource of truthではない。

---

# 39. duplicate route semanticsを維持

Implementation classをdescriptorへ変えても、以下が全てそのまま動くこと。

同一Contract:

```txt
GET /users/{id}
GET /users/{userId}
```

→ duplicate `dispatchKey` としてreject。

別Contract、同一Application:

```txt
UsersContract.get
LegacyUsersContract.get
```

が同じ `dispatchKey`

→ Graph compile reject。

method違い:

```txt
GET  /users/{id}
POST /users/{id}
```

→ 合法。

Implementation factory化でこの検査をbinding class identityへ寄せてはいけない。

---

# 40. HTTP terminal dispatch

HTTP packageではRouteがclass / ImplementationBindingを保持する設計をやめる。

概念:

```ts
interface HttpRoute {
  readonly ...
  readonly implementation:
    ImplementationDescriptor
  readonly procedure: string
}
```

前段HTTP再設計後の実際のRoute shape:

```txt
segments
dispatchKey
specificity
protocol
...
```

等をそのまま維持し、Implementation参照だけdescriptorへ置き換える。

---

# 41. HTTP invocation

旧:

```txt
container.resolveImplementation(
  route.binding.implementation
)
```

を削除。

新:

```txt
container.implementationRuntime(
  route.implementation
)
```

相当からruntime objectを取得。

その後:

```ts
const method = runtime[route.procedure]

Reflect.apply(method, runtime, [context])
```

相当で呼び出してよい。

object methodの `this` を不必要に壊さない。

ただしcanonical coding styleはclosure-based compositionを推奨する。

---

# 42. HTTP source logging

旧class name:

```txt
UsersController.get
```

相当を:

```ts
;`${implementation.name}.${procedure}`
```

で生成する。

class constructor `.name` へ依存しない。

前段HTTP再設計で追加・変更されたroute identity loggingがある場合はそれを維持する。

---

# 43. `http.controller` terminal markerは維持してよい

Implementationがgeneric化しても、HTTP pipeline上のterminal概念として:

```ts
http.controller
```

は維持してよい。

今回の目的はterminal layerの命名変更ではない。

不要に:

```txt
http.implementation
```

等へrenameしてscopeを広げない。

HTTP世界ではControllerと呼ぶこと自体は問題ない。

Core representationだけgeneric Implementationへする。

---

# 44. MessagePortも同時に移行する

HTTPだけfactory化してMessagePortをclass implementationのまま残してはいけない。

MessagePort Routeも:

```txt
Class
```

ではなく:

```txt
ImplementationDescriptor
```

を保持する。

terminal invocationも:

```txt
resolveImplementation(Class)
```

を削除し:

```txt
implementationRuntime(descriptor)
```

へ統一する。

これによりImplementationが本当にprotocol-neutralになる。

---

# 45. `messagePort.handler` terminal markerも維持してよい

HTTP同様、protocol adapter上の名前はそのままでよい。

```ts
messagePort.handler
```

をImplementation factory化だけの理由でrenameしない。

---

# 46. MessagePort semanticsを不要に変更しない

今回変更するのはImplementation construction / invocation model。

以下は不要に触らない。

```txt
message transport
response variant
server stream
attachMessagePort
message serialization
message validation semantics
```

ただしImplementation factoryへ移行するために必要な型推論・Route参照・Runtime取得は変更する。

---

# 47. Providerは今回factory-onlyにしない

今回の変更を口実に:

```txt
class Provider廃止
useClass廃止
constructor injection廃止
```

へscopeを広げない。

Provider classは既存通り利用可能。

今回classを外す対象は:

```txt
Contract / Protocol Implementation
```

である。

---

# 48. DI constructor semanticsを不要に変更しない

既存:

```ts
class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

は維持。

Provider class construction / lifecycleは今回の対象外。

Implementation factoryが:

```ts
factory: (users = inject(UsersService)) => ({
  // ...
})
```

になるだけ。

---

# 49. Layer factory semanticsを変更しない

今回ImplementationをLayerへ合わせるのであって、Layerを再設計し直すタスクではない。

既存:

```txt
recursive pipeline
Layer occurrence
child pipeline
requires/provides
requiresValidated
shortCircuits
factory
```

は維持する。

Implementation対応のためにLayer descriptor shapeを変える必要がない限り触らない。

---

# 50. class inheritanceを代替機能として実装しない

Controller classを消すことで:

```ts
class UsersController
  extends BaseController
```

のような継承はcanonical modelから消える。

これを補うために:

```txt
implementation.extend()
baseImplementation
mixin framework
inheritance helper
```

等を追加しない。

共通処理は:

```txt
closure helper
plain function
Service Provider
Layer
```

でcompositionする。

---

# 51. helperはfactory closureへ置く

例:

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: (users = inject(UsersService)) => {
    const loadUser = async (id: string) => {
      return users.find(id)
    }

    return {
      async get(ctx) {
        const user = await loadUser(ctx.params.id)

        return ctx.response.found({
          body: user,
        })
      },
    }
  },
})
```

Framework-level inheritanceは不要。

---

# 52. stateful closureは技術的には可能

factory resultはapplication lifetimeなので:

```ts
factory: () => {
  let count = 0

  return {
    get(ctx) {
      count++
      // ...
    },
  }
}
```

は技術的には成立する。

Frameworkが禁止する必要はない。

ただしrequest-specific dataやmutable domain stateの標準置き場として推奨しない。

必要な共有stateはService Providerへ置く方が明確。

---

# 53. Public exports

`@loutrejs/loutre` から少なくとも:

```txt
implementation
ImplementationDescriptor
```

をexportする。

削除:

```txt
implement
ImplementationBinding
```

`ImplementationFactory` / `ImplementationRuntimeShape` 等の補助型をpublicにするかは、利用者価値が明確な場合だけ。

public APIを不要に増やさない。

---

# 54. naming

Public function名は:

```ts
implementation(...)
```

を採用する。

以下は採用しない。

```txt
controller(...)
handler(...)
implementFactory(...)
implementationFactory(...)
defineImplementation(...)
```

理由:

- Module propertyが `implementations`
- Contract / Protocolの実装という意味が明確
- HTTP以外にも使える
- LayerとのAPI形はproperty structureで揃っており、関数名まで `factory` を含める必要がない

factoryはdescriptor property名として明示する。

---

# 55. AI時代を考慮したAPI明示性

canonical syntaxはfluent chainではなくobject propertyを採用する。

推奨:

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  procedures: ['get'],
  factory: (...) => ({
    // ...
  }),
})
```

旧:

```ts
implement(UsersContract)
  .for(http)
  .procedures('get')
  .with(...)
```

へ戻さない。

以下の情報がプロパティ名として明示されることを優先する。

```txt
name
contract
protocol
procedures
factory
```

---

# 56. definition validation

`implementation()` runtimeで最低限以下を検証する。

- selected procedureがContractに存在する
- selected procedureが指定protocolを持つ
- procedure listの重複を受け入れない
- protocol factoryのprotocol nameとContract lookupが一致する

factory自体はdefinition時に実行しない。

factory return validationはProbe / Runtime construction時。

---

# 57. Protocol `dispatchKey` はImplementation definition validation対象にしない

Implementation definition時にHTTP route duplicate等を再検査しない。

責務:

```txt
contract()
  → same Contract dispatchKey uniqueness

graph
  → Application-wide dispatchKey uniqueness

implementation()
  → Contract / protocol / selected procedure linkage
```

を維持。

---

# 58. compile-time tests

専用type testを追加する。

推奨:

```txt
tests/types/implementation.test-d.ts
```

最低限確認する。

## 全procedure inference

```ts
implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,

  factory: () => ({
    get(ctx) {
      // typed
    },

    create(ctx) {
      // typed
    },
  }),
})
```

全HTTP procedureが要求される。

1つ欠けたらcompile error。

## ctx inference

HTTP:

```txt
ctx.params
ctx.query
ctx.headers
ctx.body
ctx.response
Layer provides context
```

がprotocol definitionから正しく推論される。

## 前段HTTP path semantics

```txt
path: /users/{id}
validationなし
→ ctx.params.id: string
```

```txt
params: { id: z.coerce.number() }
validate.paramsあり
→ ctx.params.id: number
```

## result inference

未宣言response variantや不正body typeを返すprocedureをcompile-time reject。

## partial procedures

```ts
procedures: ['get']
```

なら `get` だけ要求。

## invalid procedure

指定protocolに存在しないprocedureをreject。

## wrong protocol

Contract procedureが指定protocolを持たない組み合わせをreject。

## widened regression

必要なliteral inferenceが `string` へwideningしてctx型を失わない。

---

# 59. runtime Implementation tests

最低限:

## factory once per ApplicationRuntime

同じImplementationに複数request / invocationしてもfactory constructionが1回。

## DI

```ts
factory: (service = inject(Service)) => ({
  // ...
})
```

が正常resolve。

## async factory reject

unsafe castでasync factoryを通しruntime fail。

## primitive result reject

unsafe castでprimitive return。

## missing procedure reject

unsafe castでselected procedureがruntime objectにない。

## partial implementation

selected procedureのみ正しくdispatch。

## source logging

descriptor `name` がsourceへ利用される。

---

# 60. Graph tests

最低限:

## Implementation dependency edge

```txt
UsersController
  ↓ inject
UsersService
```

がGraphに出る。

class nodeではなくImplementation node。

## Graph Probe factory

factory default parameter内 `inject()` をprobeしてedge取得。

## factory once per descriptor per probe

複数procedureでもImplementation factoryをprocedureごとに再実行しない。

## missing provider

Implementation factoryがundeclared providerをinjectした場合:

```txt
LUTRE_DI_UNRESOLVED
```

相当。

## duplicate route regression

前段タスクで追加されたgeneric `dispatchKey` duplicate detectionがImplementation factory化後もgreen。

---

# 61. HTTP runtime regression tests

前段HTTP再設計のtestsを削除・弱体化しない。

最低限以下が引き続きgreen。

```txt
raw path params
property-wise params validation
validation issue path
invalid path
percent decoding
static > param
registration order independent
deeper route specificity
method separation
dispatchKey normalization
same Contract duplicate
cross Contract duplicate
```

Implementation class削除を理由に期待値を旧route semanticsへ戻さない。

---

# 62. MessagePort tests

少なくとも1つ以上のMessagePort fixtureを新Implementation APIへ移行し:

```ts
implementation({
  name: '...',
  contract: ...,
  protocol: messagePort,
  factory: (...) => ({
    // ...
  }),
})
```

で動作確認。

確認:

```txt
unary invocation
server-stream if existing example has it
DI injection
source logging
Graph implementation edge
```

---

# 63. examplesを全移行

repository内を検索し、以下を全て新APIへ移行する。

```txt
implement(
ImplementationBinding
resolveImplementation(
class *Controller
class *Handler
implements ControllerOf
implements HandlerOf
```

ただし普通のProvider classやテスト用classまで機械的に消さない。

「Contract implementationとして使われているclass」だけが対象。

---

# 64. docsを更新

少なくとも以下を検索する。

```txt
implement(
.for(http)
.with(
ImplementationBinding
managed implementation class
Controller class
Handler class
resolveImplementation
probeClass
```

Source Compiler廃止文書等に:

```txt
Contract / Protocol implementation bindingに明示されたclass
```

のような記述が残っている場合、新しいdescriptor + factory semanticsへ更新する。

---

# 65. Architecture wording

Architecture上のmanaged component説明を概念的に:

旧:

```txt
framework-managed class
- Provider class
- Contract implementation class
...
```

新:

```txt
framework-managed component

Provider
- class / factory / value / conditional

Layer
- descriptor + synchronous factory

Implementation
- descriptor + synchronous factory
```

へ更新。

Graph-first原則は維持。

---

# 66. Source Compiler廃止方針との整合

Implementation factory化はSource Compilerを復活させる理由にしてはいけない。

禁止:

```txt
TypeScript AST inspection
class implements clause inspection
decorator metadata
emitDecoratorMetadata
reflect-metadata
source transform
runtime class name inference
```

Contract / protocol linkageはdescriptorのstatic valueとして明示する。

---

# 67. decoratorを導入しない

禁止:

```ts
@Controller(...)
class UsersController {}
```

```ts
@Implement(...)
class UsersController {}
```

今回の目的はclass metadata追加ではなく、class依存そのものをImplementation modelから外すこと。

---

# 68. global registryを導入しない

`implementation()` 呼び出し時にglobal registryへ自動登録しない。

ImplementationはModuleへ明示的に所属させる。

```ts
implementations: [UsersController]
```

と書いたものだけApplication Graphへ参加する。

---

# 69. Module ownershipを維持

Implementation descriptorがself-describingになってもModuleは必要。

責務:

```txt
Implementation descriptor
  → 何をどう実装するか

Module
  → Applicationへ何を所属させるか
```

この分離を維持。

---

# 70. no hidden discovery

以下は禁止。

```txt
filesystem scan
export scan
global registration
class naming convention
decorator scan
implements clause scan
```

Application GraphはModule declarationから明示的に作る。

---

# 71. error semantics

少なくとも以下を明確に扱う。

推奨code:

```txt
LUTRE_IMPL_ASYNC_FACTORY
LUTRE_IMPL_FACTORY_RESULT
LUTRE_IMPL_NOT_PREPARED
LUTRE_IMPL_004
```

既存codeとの整合を確認し、無意味にduplicate codeを増やさない。

TypeScriptで防げるものもunsafe cast / JS経路ではruntime/Graphで防御する。

---

# 72. implementation name

`name` はrequired propertyとする。

```ts
implementation({
  name: 'UsersController',
  // ...
})
```

変数名からのruntime inferenceへ依存しない。

用途:

```txt
Graph label
diagnostic
logging source
explain output
```

同名descriptorが存在しても内部identity collisionしない設計にする。

---

# 73. descriptor immutability

`implementation()` が返すdescriptorは利用者が後から:

```ts
UsersController.protocol = '...'
UsersController.procedures.push(...)
```

のように破壊できない形を推奨する。

TypeScript readonlyだけでなく、既存core descriptorの方針と整合するならruntime `Object.freeze()` を利用してよい。

少なくともnormalized `procedures` を外部mutable arrayの参照のまま保持しない。

---

# 74. HTTP path parserとの責務分離

前段タスクで導入された `parseHttpPath()` / parsed segments / specificity等がある場合、それらはHTTP package内に維持。

Implementation packageからimportしない。

Core implementationは以下を知らない。

```txt
HTTP method
HTTP path
HTTP params
specificity
segment
route matcher
```

Coreが知るのは:

```txt
Contract
Protocol name
procedure names
factory
```

だけ。

---

# 75. dispatchKeyとの責務分離

Implementation descriptorへ `dispatchKey` をcopyして保持する必要はない。

procedureごとのdispatch identityはContract内Protocol descriptorにある。

Graph targetが必要な時に:

```txt
implementation.contract
  ↓
procedure
  ↓
protocol descriptor
  ↓
dispatchKey
```

を取得。

同じ情報をImplementation descriptorへ二重保持しない。

---

# 76. acceptance criteria

以下が全て成立したら完了。

- `implementation({...})` がPublic API
- `ImplementationDescriptor` がPublic API
- `implement()` 削除
- `ImplementationBinding` 削除
- Contract Implementationがclassを要求しない
- canonical HTTP Controllerがplain factory object
- canonical MessagePort Handlerがplain factory object
- `factory` 内で `inject()` 可能
- factoryは同期限定
- async factoryをruntime reject
- factory resultをApplicationRuntime内でcache
- request/invocationごとにfactory再実行しない
- Implementation scope optionを追加していない
- Implementation runtimeをLifecycle participantにしていない
- Implementationを暗黙DI token化していない
- Moduleは `implementations: [Descriptor]`
- `ctx` がContract/Protocolから自動推論
- `ControllerOf` / `ContextOf` がcanonical usageでは不要
- partial `procedures` が型安全
- omitted `procedures` は指定protocolの全procedureへnormalize
- invalid procedureをcompile-time reject
- unsafe invalid procedureをruntime reject
- Graph ProbeがImplementation factoryを実行
- Implementation → Provider inject edgeがGraphへ出る
- Implementation nodeがclass tokenではない
- Provider class用 `probeClass()` semanticsを壊していない
- class prototype inspectionをImplementation validationから削除
- HTTP runtimeがdescriptor runtimeをdispatch
- MessagePort runtimeもdescriptor runtimeをdispatch
- HTTP / MessagePortでclass-based `resolveImplementation` を使用しない
- `dispatchKey` semanticsを維持
- HTTP route duplicate semanticsを維持
- static > param routingを維持
- registration order independentを維持
- 前段HTTP params/path testsを維持
- MessagePort tests green
- `loutre graph` / `loutre graph di` 相当がImplementation依存を正しく表示
- Source Compiler不要
- decorator不要
- global registry不要
- examples / fixtures移行
- architecture/docs更新
- type tests追加
- runtime tests追加
- Graph tests追加
- conformance tests green
- build green

---

# 77. 最終目標形

前段HTTP Path / Params再設計と今回のImplementation Factory再設計を合わせたHTTPの最終形:

```ts
export const UsersContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{id}',

        request: {
          params: {
            id: z.coerce.number(),
          },
        },

        responses: {
          found: {
            status: 200,
            body: User,
          },
        },

        pipeline: [validate.params, http.controller],
      }),
    },
  }),
})
```

```ts
export const UsersController = implementation({
  name: 'UsersController',

  contract: UsersContract,
  protocol: http,

  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      ctx.params.id
      // number

      return ctx.response.found({
        body: await users.get(ctx.params.id),
      })
    },
  }),
})
```

```ts
export const UsersModule = defineModule(() => ({
  providers: [UsersService],

  implementations: [UsersController],
}))
```

Graph:

```txt
UsersContract.get.http
  dispatchKey:
    http:GET:/users/{}

  implementation:
    UsersController

  dependencies:
    UsersController
      └─ inject → UsersService
```

Runtime:

```txt
Application construction
        │
        ├─ Implementation factory
        │      └─ inject(UsersService)
        │
        ├─ Layer factories
        │
        └─ Provider object graph
                │
                ▼
            Lifecycle
                │
                ▼
Request
  ↓
HTTP router
  ↓
path params
  ↓
pipeline
  ↓
http.controller
  ↓
cached UsersController runtime.get(ctx)
```

---

# 78. 実装順序

推奨順序:

1. 最新 `develop` を取得
2. 前段HTTP Path / Route Identity再設計が完了していることを確認
3. core `implementation.ts` をdescriptor + factoryへ変更
4. Module typeを変更
5. Injection ContextへImplementation consumer追加
6. RuntimeへImplementation factory construction/cache追加
7. Graph Probeをclass implementationからdescriptor factoryへ変更
8. Graph procedure validationをprototype inspectionからprobe resultへ変更
9. HTTP runtime dispatchをdescriptorへ変更
10. MessagePort runtime dispatchをdescriptorへ変更
11. `integrations/` と `examples/` を移行
12. type tests追加
13. runtime tests追加
14. Graph tests追加
15. docs / architecture更新
16. repository-wide grepで旧API残存確認
17. full verify

途中でHTTPだけgreenにして終了しない。

MessagePortまで移行して初めてImplementation abstraction移行完了。

---

# 79. repository-wide削除確認

完了前に少なくとも以下を検索。

```txt
implement(
ImplementationBinding
resolveImplementation(
binding.implementation
implementation.prototype
managed implementation class
```

意図したlegacy reference以外は残さない。

docs内の旧設計説明も更新。

`ControllerOf` / `ContextOf` / `HandlerOf` 等はadvanced utilityとして意図的に残す場合があるため、単純全削除しない。

---

# 80. 検証

repositoryの実際のscriptsを最新状態で確認し、利用可能なものを全て実行。

最低限:

```txt
typecheck
type tests
unit tests
Graph tests
HTTP tests
MessagePort tests
build
conformance
```

format / lint scriptが存在する場合はそれも実行。

失敗をskipしない。

既存testを削除してgreenにしない。

仕様変更に伴う正当な期待値変更だけ更新する。

---

# 81. 設計に迷った場合の優先順位

迷った場合は以下をsource of truthにする。

```txt
1. Application Graphが明示的であること
2. Contract / Protocolがruntime descriptorとして存在すること
3. Implementationはdescriptor + synchronous factory
4. Layerもdescriptor + synchronous factory
5. ModuleがApplicationへの所属を明示すること
6. inject() dependencyをGraph Probeで完全取得できること
7. request/message dataはctx
8. resource lifecycleはProvider
9. dispatch identityはProtocol.dispatchKey
10. HTTP固有知識はHTTP package
11. Graph / coreはprotocol-neutral
12. class / decorator / Source Compilerへ依存しない
13. fluent APIより明示propertyを優先
14. v0.xでは互換性より最終設計の一貫性を優先
```

最終的なメンタルモデル:

```txt
Loutre
│
├─ Contract
│    └─ Protocol descriptors
│          └─ dispatchKey
│
├─ Module
│    ├─ Providers
│    └─ Implementations
│
├─ Provider
│    └─ resource / lifecycle
│
├─ Layer
│    ├─ static metadata
│    └─ synchronous factory
│
└─ Implementation
     ├─ static metadata
     │    ├─ name
     │    ├─ contract
     │    ├─ protocol
     │    └─ procedures
     │
     └─ synchronous factory
          └─ procedure runtime object
```

**Loutreの本体はclass hierarchyではなく、明示的なApplication Graphである。**
