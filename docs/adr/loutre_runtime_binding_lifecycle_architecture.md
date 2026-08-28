# Loutre Runtime Binding / Lifecycle Architecture

Status: **Frozen**

Date: 2026-08-28

## 1. Decision summary

Loutreのportable Application Definitionとruntime固有の起動・callback・embedding境界を、次の3種類へ分離する。

```text
serve   = Application側がlong-lived host lifecycleを所有する
bind    = 外部runtimeがlifecycleを所有し、Loutreへcallbackする
attach  = 既に存在するevent source / transportへLoutreを接続する
```

代表APIは次とする。

```ts
nodeRuntime.serve({ application, ... })
bunRuntime.serve({ application, ... })
denoRuntime.serve({ application, ... })

denoRuntime.bind({ application, ... })
workerdRuntime.bind({ application, ... })
lambdaRuntime.bind({ application, ... })

electronRuntime.attach({ application, port, ... })
```

`createDenoFetchDriver()` / `createWorkerdFetchDriver()` / `createLambdaHttpDriver()` / `createLambdaStreamingHttpDriver()` / `attachElectronMessagePort()` 等のruntime-specific low-level assembly APIを通常Application author向けpublic surfaceにはしない。

runtime packageのhigh-level APIはportable `ApplicationDefinition` を直接受け取り、必要なInvocation Binding / Protocol Execution / native handler assemblyを内部で行う。

Application sourceはruntimeによって変更しない。

```ts
export default defineApplication({
  modules: [AppModule()],
})
```

---

## 2. Why

現在のlow-level構造ではcallback runtimeを利用するために、利用者自身が次のassemblyを知る必要がある。

```text
ApplicationDefinition
    ↓
Invocation Binding
    ↓
.http / MessagePort execution
    ↓
runtime-specific driver
    ↓
native handler
```

例えば概念的に次のようなコードになる。

```ts
const invocation = binding.invocation({ application })
const handler = createDenoFetchDriver(invocation.http)
```

これはframework内部のProtocol ExecutionをApplication authorへ露出している。

またruntimeごとに`createXXXDriver` / `createXXXBinding`をtop-levelへ追加すると、公開APIがruntime・protocol・modeの組み合わせ数に比例して増える。

Loutreはportable Applicationを中心に据え、runtime固有のassemblyをruntime adapter側へ押し込む。

---

## 3. Lifecycle ownership

### 3.1 `serve()`

`serve()`はApplication側がlong-lived process / listener lifecycleを所有する実行形態である。

代表例:

```text
Node.js process
Bun process
Deno process using Deno.serve()
```

利用者はhandlerをexportする必要がない。

```ts
await nodeRuntime.serve({
  application,
  port: 3000,
})
```

```ts
await denoRuntime.serve({
  application,
  port: 3000,
})
```

runtime adapterがApplicationRuntimeの生成・初期化、対応host capabilityの起動、shutdown connectionを所有する。

`serve()`はHTTP専用という意味ではなく、long-lived service host boundaryを表す。Applicationが持つhost capabilityのうち対象runtimeが提供可能なものを起動する。

one-shot Task execution APIは本ADRの対象外であり、`serve()`へ統合しない。

### 3.2 `bind()`

`bind()`は外部runtimeがmodule / handler lifecycleを所有する実行形態である。

代表例:

```text
AWS Lambda
Cloudflare Workers / workerd
`deno serve`
```

`bind()`はruntime-native handler valueを返す。

Loutre自身がJavaScript `export`を行うわけではない。

Lambda:

```ts
export const handler = lambdaRuntime.bind({
  application,
})
```

workerd / Cloudflare Workers:

```ts
export default workerdRuntime.bind({
  application,
})
```

`deno serve`:

```ts
export default denoRuntime.bind({
  application,
})
```

同じ戻り値はexportせずtest / embeddingから直接呼び出してよい。

```ts
const handler = lambdaRuntime.bind({ application })
await handler(event)
```

したがって、**export conventionはApplication semanticsではなくdeployment / JavaScript module boundaryの責務**とする。

### 3.3 `attach()`

`attach()`は既に存在するtransport / event sourceへApplicationを接続する実行形態である。

代表例:

```text
Electron MessagePort
Web MessagePort
embedded transport
```

```ts
electronRuntime.attach({
  application,
  port,
})
```

`attach()`はlistenerそのものやmodule exportを所有しない。

---

## 4. Export requirement is a host property

handler exportの要否はProtocolではなくhostの起動モデルによって決まる。

| Execution | Host lifecycle | User module export |
| --- | --- | --- |
| Node long-lived service | Application / process | 不要 |
| `Bun.serve()` | Application / process | 不要 |
| `Deno.serve()` | Application / process | 不要 |
| `deno serve` | Deno CLI runtime | default export必要 |
| Cloudflare Workers / workerd | Worker runtime | default export必要 |
| AWS Lambda | Lambda runtime | configured named export必要 |
| Electron MessagePort | existing Electron lifecycle | 不要 |
| test / custom embedding | caller | 不要 |

Loutre public APIはこの差を`createXXXExport()`等の名前へ反映しない。

`bind()`がnative handler valueを返し、必要な場合のみ利用者またはgenerated entryがexportする。

---

## 5. Generated deployment entry

通常Application authorはruntime固有のentry fileを手書きしなくてよい。

```text
Application source
    ↓
loutre build --runtime <target>
    ↓
generated deployment entry
```

生成例:

Lambda:

```ts
import application from './application.mjs'
import { lambdaRuntime } from '@loutrejs/runtime-lambda'

export const handler = lambdaRuntime.bind({ application })
```

workerd:

```ts
import application from './application.mjs'
import { workerdRuntime } from '@loutrejs/runtime-workerd'

export default workerdRuntime.bind({ application })
```

Deno `serve` target:

```ts
import application from './application.mjs'
import { denoRuntime } from '@loutrejs/runtime-deno'

export default denoRuntime.bind({ application })
```

canonical Application sourceへruntime-specific exportを混ぜない。

---

## 6. Invocation Binding

Invocation Binding自体は削除しない。

これは次の利用者向けのlow-level public primitiveとする。

```text
runtime adapter author
deployment tooling
custom host / embedding
advanced integration
```

通常Application authorは直接利用しない。

公開する場合はflatな`createInvocationBinding()`等を増やさず、binding namespace配下に置く。

```ts
binding.invocation({
  application,
  environment,
  arguments,
})
```

resource bindingも同じnamespaceへ集約できる。

```ts
binding.queue(queue, driver)
```

これにより将来binding種別が増えても、top-levelへ`createXXXBinding` / `bindXXXDriver`を増殖させない。

runtime high-level APIは内部でInvocation Bindingを利用してよいが、`invocation.http`等を通常利用者へ要求しない。

---

## 7. Environment / Arguments ownership

Application EnvironmentとApplication ArgumentsはApplicationRuntime lifetime単位で固定される。

request / invocationごとに再bindしない。

```text
runtime native environment
       ↓
runtime adapter / binding
       ↓
ApplicationRuntime initialization
       ↓
validated Application Environment
```

runtime high-level adapterはruntime-native Environment sourceの取得・projectionを所有する。

例:

```text
Node        -> process.env
Deno        -> Deno environment source
Lambda      -> process.env / Lambda runtime environment
workerd     -> Worker bindings
```

ただしApplication Argumentsはdeployment/runtimeから自動推測せず、必要なApplicationには明示的に渡す。

```ts
lambdaRuntime.bind({
  application,
  arguments: { ... },
})
```

### 7.1 callbackで初めてEnvironmentが得られるruntime

workerdの`env`等、module evaluation時点でEnvironment sourceが得られずcallback時に初めて供給されるruntimeでは、ApplicationRuntimeをlazyに構築 / 初期化してよい。

最初のcallbackでEnvironment sourceをbindし、同一ApplicationRuntimeでは以後rebindしない。

runtimeが同一deployment environmentに対して複数callbackを処理する場合、Controller / Provider / validated Environmentを再利用できる。

requestごとに異なる値はApplication EnvironmentではなくExecution Contextへ置く。

---

## 8. Controller / Implementation semantics

LoutreにおけるHTTP ControllerはHTTP `implementation(...)`として扱う。

Controller / Implementationは**runtime-agnostic**であり、`serve()` / `bind()` / `attach()`の違いを知らない。

### 8.1 Lifetime

Implementation runtimeはApplicationRuntime scopedとする。

```text
ApplicationRuntime
    ↓
Implementation factory()   # 1回
    ↓
Controller runtime object
    ├ request A -> method(ctxA)
    ├ request B -> method(ctxB)
    └ request C -> method(ctxC)
```

factoryはApplicationRuntimeごとに一度だけ評価し、同一runtime lifetime内では構築済みImplementation runtimeを再利用する。

この挙動はruntimeごとに変えない。

- Node: process / ApplicationRuntime lifetimeで再利用
- Lambda: execution environmentのwarm reuse中は再利用。cold startでは新しいApplicationRuntimeを構築
- workerd:同一isolate / ApplicationRuntime lifetimeで再利用
- Deno / Bun: process / ApplicationRuntime lifetimeで再利用

### 8.2 Dependency injection

Application lifetimeのdependencyはfactory DIへ置く。

```ts
const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (
    users = inject(UserService),
    database = inject(Database),
  ) => ({
    async get(ctx) {
      // ...
    },
  }),
})
```

代表例:

```text
Database
Repository
Service
validated Environment
Application Arguments
component Logger
```

### 8.3 Execution state

request / execution固有の値をfactory DIへ入れてはならない。

Execution固有値はProtocol ContextからController methodへ渡す。

代表例:

```text
Request
path params
query
body
authenticated principal
current tenant
request logger
AbortSignal
runtime-neutral request metadata
```

```ts
factory: (users = inject(UserService)) => ({
  async get(ctx) {
    return users.find(ctx.currentUser.id)
  },
})
```

Controller instanceへcurrent request stateを保存してはならない。

```ts
factory: () => {
  let currentUser

  return {
    get(ctx) {
      currentUser = ctx.currentUser // 禁止: concurrent executionで競合する
    },
  }
}
```

### 8.4 Native runtime input

ControllerはLambda event、Cloudflare `env` / execution context、Deno handler info等のruntime-native inputを直接受け取らない。

runtime-native inputはruntime adapterでportable Protocol inputへ正規化する。

---

## 9. HTTP dispatch semantics

HTTP runtime adapterはruntime-native HTTP inputを可能な限りWeb Standard `Request`へ正規化する。

```text
runtime native HTTP input
    ↓
Web Request
    ↓
Loutre HTTP Protocol Execution
    ↓
route dispatch
    ↓
Contract procedure
    ↓
Controller method(ctx)
```

### 9.1 Route identity

標準HTTP route identityは次とする。

```text
HTTP method + normalized pathname
```

例:

```text
GET https://example.com/v1/api/test
```

はLoutre内部で、

```text
method   = GET
pathname = /v1/api/test
```

としてdispatchする。

```ts
http({
  method: 'GET',
  path: '/v1/api/test',
  // ...
})
```

に一致すれば、そのProtocolを実装しているController procedureを呼ぶ。

### 9.2 Host / origin

Host / origin / schemeは標準route identityに含めない。

したがって標準設定では、

```text
GET https://example.com/v1/api/test
GET https://api.example.net/v1/api/test
```

は同一routeへdispatchされる。

host-based routingが将来必要になった場合はHTTP Protocol featureとして明示追加する。暗黙にroute identityへ混ぜない。

### 9.3 Path parameters

path pattern matchingはruntimeに依存しない。

```text
GET /v1/users/123
        ↓
GET /v1/users/:id
        ↓
ctx.params.id = "123"
```

### 9.4 Base path / proxy rewrite

API Gateway、reverse proxy、platform routing等がpath prefixを書き換える場合、Loutreはruntime adapterから受け取った**正規化後のRequest pathname**をrouting source of truthとする。

Infrastructure側のbase-path mappingをControllerへ漏らさない。

---

## 10. Lambda specifics

Lambda `bind()`はLambda runtimeが呼び出せるhandler functionを返す。

```ts
export const handler = lambdaRuntime.bind({ application })
```

HTTP eventの場合、Lambda eventをWeb `Request`へ変換してLoutre HTTP Protocol Executionへ渡し、`Response`をLambda resultへ変換する。

概念:

```text
Lambda HTTP event
    ↓
Request
    ↓
method + pathname dispatch
    ↓
Controller
    ↓
Response
    ↓
Lambda result
```

response streamingは別factoryを増やさず、同一`bind()`のmodeとして表現する。

```ts
export const handler = lambdaRuntime.bind({
  application,
  response: 'streaming',
})
```

具体的なAWS streaming wrapperはruntime-lambda内部責務とする。

---

## 11. Workerd / Cloudflare Workers specifics

`workerdRuntime.bind()`はWorker moduleのdefault exportとして利用可能なhandler objectを返す。

```ts
export default workerdRuntime.bind({ application })
```

incoming `Request`はそのままLoutre HTTP Protocol Executionへ渡せる。

Worker bindings (`env`)はApplication Environment sourceとしてruntime adapterが接続する。

Worker execution contextのrequest-specific capability（例: background work）はApplication-wide Environmentへ格納せず、必要な場合はExecution Context capabilityとしてProtocol / Layerへ渡す。

---

## 12. Deno specifics

Denoは2種類のhost ownershipを持つ。

### `Deno.serve()`をApplication code側で起動

```ts
await denoRuntime.serve({ application })
```

export不要。

### `deno serve` CLIがlistenerを所有

```ts
export default denoRuntime.bind({ application })
```

default exportが必要。

両者はController / HTTP routing semanticsを共有し、違うのはhost lifecycle ownershipのみ。

---

## 13. Naming rules

Public runtime APIは動作責務を表す動詞へ統一する。

```text
serve
bind
attach
```

以下のようなruntime/protocol implementation detailをpublic application API名へ増やさない。

```text
createDenoFetchDriver
createWorkerdFetchDriver
createLambdaHttpDriver
createLambdaStreamingHttpDriver
createNodeHttpServerDriver
attachElectronMessagePort
```

low-level driverがpackage内部またはadvanced adapter APIとして必要な場合でも、通常利用者向けdocumentationのcanonical pathにはしない。

---

## 14. Type surface

runtime high-level APIはApplicationDefinitionからcapabilityを型推論し、可能な限り不正な組み合わせをcompile-timeで除外する。

例:

- HTTP capabilityを持たないApplicationをHTTP-only bind targetへ渡さない
- required Application Argumentsがある場合はruntime API optionで必須化する
- unsupported runtime capabilityはbuild / bind / serve前にdiagnosticする

runtime adapter内部の`HttpProtocolExecution`等は利用者が明示的に選択しなくてよい。

---

## 15. Concurrency invariant

ApplicationRuntime scoped Controller / Providerは複数executionから共有され得る。

したがってframeworkは次を保証・要求する。

1. request stateはContextへ置く
2. Controller instanceへcurrent requestを保存しない
3. runtime差によってController factory lifetimeを変更しない
4. Lambda warm reuse / Worker concurrent executionでも同じsemanticsを維持する

このinvariantにより、同じApplication codeをNode / Deno / Bun / Lambda / workerdへportableに配置できる。

---

## 16. Non-goals

本ADRでは次をfreezeしない。

- one-shot Task向けruntime-specific convenience APIの最終命名
- host-based HTTP routing API
- Cloudflare固有background APIの具体Context surface
- LambdaのHTTP以外の全event sourceを標準化すること
- vendor-specific deployment configuration syntax

ただしこれらを追加する場合も、portable Application Definitionとruntime binding boundaryを壊してはならない。

---

## 17. Migration direction

実装は段階的に次へ移行する。

1. `binding.invocation()`をruntime adapter/tooling向けpublic primitiveとして整理
2. runtime packageへ`serve()` / `bind()` / `attach()` high-level APIを追加
3. high-level APIが`ApplicationDefinition`を直接受けるようにする
4. runtime-specific low-level `createXXXDriver()`をinternal / non-canonicalへ降格
5. conformanceをhigh-level APIまたはgenerated entry経由へ変更
6. `loutre build --runtime`がruntime-required export entryを生成
7. docs / examplesからmanual Invocation Binding + Protocol Execution assemblyを削除

破壊的変更を許容し、legacy flat APIを永久互換層として残すことを要求しない。

---

## 18. Frozen invariants

以下を今後の設計判断で変更しない前提とする。

1. Application sourceはportable `ApplicationDefinition`のまま
2. runtime lifecycle boundaryは`serve / bind / attach`で表現する
3. export要否はhost/deployment propertyでありApplication semanticsではない
4. runtime high-level APIはApplicationDefinitionを直接受ける
5. Invocation Binding / Protocol Execution assemblyを通常利用者へ要求しない
6. Invocation Bindingを公開する場合は`binding.*` namespaceへ集約する
7. Controller / Implementation factoryはApplicationRuntimeごとに1回
8. request / execution stateはController factoryではなくContextへ置く
9. Controllerはruntime-native eventを知らない
10. HTTP native inputはWeb `Request`へ正規化する
11. HTTP標準routing identityは`method + pathname`
12. host / originは標準routing identityに含めない
13. Application Environment / ArgumentsはApplicationRuntime lifetimeで固定し、requestごとにrebindしない
14. generated deployment entryはruntime-required export conventionを吸収してよい

---

## 19. References

- AWS Lambda Node.js handler naming / exported handler: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
- Cloudflare Workers fetch handler / module default export: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
- Deno `deno serve` lifecycle ownership and default export shape: https://docs.deno.com/runtime/reference/cli/serve/
