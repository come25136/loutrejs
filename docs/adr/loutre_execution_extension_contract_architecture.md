# Loutre Execution Extension Contract Architecture

Status: **Proposed / Design Frozen**

Date: 2026-09-05 JST

Target: Loutre v0 full breaking redesign

Related: `loutre_application_graph_kernel_architecture.md`

## 1. このADRの責務

本ADRはExecution Extension contractの**唯一のSource of Truth**とする。

Application Graph Kernel ADRはCoreの責務境界だけを定義し、以下の具体仕様は本ADRだけで定義する。

- Execution Definition
- `ExecutionExtension`
- `ExecutionContribution`
- compile / validate / runtime / projection
- Runtime Capability
- Host API
- active Execution Lease
- drain / close / shutdown order

同じinterfaceやlifecycleを他ADRへ転写しない。

## 2. Execution Definition

Extension固有DSLは最終的にbranded Execution Definitionになる。

概念形は現行Core APIと同じ。

```ts
interface ExecutionDefinition<
  TExtension extends ExecutionExtension = ExecutionExtension,
> {
  readonly kind: 'execution-definition'
  readonly extension: TExtension
  readonly [executionDefinitionBrand]: true
}
```

利用者やExtension作者はbrandを手書きせず、`defineExecution(extension, definition)`を利用する。

DefinitionはApplication Model構築前の入力であり、RuntimeやToolingがDefinitionを直接再解釈してはならない。

## 3. Execution Extension

Execution Extensionは次のcontractを持つ。

```ts
interface ExecutionExtension<
  TDefinition extends ExecutionDefinition,
  TCompiled,
  TNamespace extends string,
  THostApi extends object,
  TRuntime extends ExecutionExtensionRuntime,
> {
  readonly kind: 'execution-extension'
  readonly name: string

  compile(
    definition: TDefinition,
    context: ExecutionCompileContext,
  ): ExecutionContribution<TCompiled>

  validate?(
    context: ExecutionExtensionValidationContext<TCompiled>,
  ): readonly Diagnostic[]

  createRuntime(
    context: ExecutionExtensionRuntimeContext<TCompiled>,
  ): TRuntime | Promise<TRuntime>

  project?(context: ExecutionProjectionContext<TCompiled>): unknown

  readonly host?: HostExtension<TNamespace, THostApi, TCompiled, TRuntime>
}
```

CoreはExtension名や`executionKind`の値でprotocol-specific分岐を行わない。

## 4. compile

`compile()`はDefinitionをcanonical Application Model contributionへ変換する。

### 4.1 一度だけ実行する

同じApplication Model buildで1 Definitionに対するcompileは一度だけ行う。

```text
Definition
   │
   └── compile once
          │
          ▼
Application Model compiled contribution
          ├── Runtime
          └── Graph / Tooling
```

Runtime起動時やGraph projection時に再compileしない。

### 4.2 side-effect free

compileは同期かつruntime side effectを持たない。

禁止:

```text
network I/O
listener start
database connection
timer start
runtime native state read
business operation
```

許可:

```text
route/path normalization
schema identity retention
handler/factory reference retention
DI dependency collection
Runtime Capability requirement collection
static metadata normalization
```

## 5. Compiled Execution Contribution

Coreへ渡すcanonical contributionは次の形とする。

```ts
interface ExecutionContribution<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: string
  readonly executionKind: string
  readonly extension: ExecutionExtension
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
}
```

Coreが意味を理解するfield:

```text
id
executionKind as opaque identifier
extension identity
dependencies
capabilities
```

`compiled`はExtension-owned opaque valueである。

HTTPならresolved route、middleware、factory等を保持できる。WebSocketならroute、codec、session factory等を保持できる。

### 5.1 heterogeneous modelのtype erasure

Application Modelは異なるExtensionのcontributionを同一collectionへ保持するため、Core内部のheterogeneous boundaryでは`compiled: unknown`相当のtype erasureを許容する。

```text
HTTP<THttpCompiled> ─┐
WS<TWsCompiled> ─────┼─> ApplicationModel.executions[]
Task<TTaskCompiled> ─┘
```

Extension descriptorとその`compiled`型の相関を復元するcast/type erasureは、Extensionへのdispatch境界へ局所化する。

この内部都合を公開Extension APIや利用者コードへ露出させない。

## 6. validate

`validate()`はそのExtensionが所有する**全compiled contributions**を受け取る。

用途:

```text
duplicate HTTP route
WebSocket route collision
Extension-specific global invariant
compiled middleware compatibility diagnostic
```

Validation failureは`Diagnostic`としてApplication Modelへ蓄積する。

error diagnosticを持つApplication ModelはRuntime開始前に拒否される。

Protocol固有invariantはCoreへ移さずExtensionで検証する。

HTTPの例:

```text
status range
bodyless status
path params exactness
body/content-type contract
middleware short-circuit response compatibility
```

可能なものはTypeScript上でも検出し、dynamic inputや型escapeに備えてruntime/model validationも持つ。

## 7. Runtime Capability

Runtime Capabilityはplatform/runtime primitiveへのtyped requirementである。

```ts
interface RuntimeCapability<TValue = unknown> {
  readonly kind: 'runtime-capability'
  readonly id: string
}
```

### 7.1 identity

Capability tokenの参照identityは**token object identity**とする。

```ts
const HTTP_SERVER = runtimeCapability<HttpServerDriver>('http.server')
```

Requirementとbindingは同じtoken objectを共有する。

`id`は次に利用するstable identifierである。

```text
Application Model node
Graph IR
diagnostic
collision detection
error message
```

異なるCapability token objectが同じ`id`を使用した場合はcollisionとして拒否する。

`Symbol(id)`のような第2の未使用identity fieldは持たない。

### 7.2 binding

```ts
interface RuntimeCapabilityBinding<TValue> {
  readonly capability: RuntimeCapability<TValue>
  readonly value: TValue
}
```

Runtimeは必要CapabilityがbindingされていることをExtension runtime生成前に検証する。

## 8. createRuntime

`createRuntime()`はApplication lifecycle中に一度生成されるExtension-owned runtime resourceを作る。

```ts
interface ExecutionExtensionRuntimeContext<TCompiled> {
  readonly executions: readonly ExecutionContribution<TCompiled>[]
  readonly capabilities: RuntimeCapabilityBindings
  readonly applicationRuntime: ExecutionKernelRuntime
}
```

ここでlistener adapter、scheduler state、dispatch table、handler factory instance等を準備できる。

Definitionを再compileしてはならない。

Extension Runtimeは必要に応じて次を実装する。

```ts
interface ExecutionExtensionRuntime {
  drain?(): void | Promise<void>
  close?(): void | Promise<void>
}
```

## 9. Host API

Extensionは任意でHost namespaceを公開できる。

```ts
interface HostExtension<
  TNamespace extends string,
  TApi extends object,
  TCompiled,
  TRuntime extends ExecutionExtensionRuntime,
> {
  readonly namespace: TNamespace
  create(context: HostExtensionContext<TCompiled, TRuntime>): TApi
}
```

例:

```text
HTTP        -> app.http.fetch(request)
Tasks       -> app.tasks.run(task)
MessagePort -> app.messagePort.handle(...)
```

Host APIの型はExtension identityからApplication型へ合成する。Coreへ`HasHttp`等の新しいprotocol hard-codeを増やさない。

### 9.1 Host create failure

Runtime initialization完了後に`host.create()`が失敗した場合、Applicationをrunningのまま残してはならない。

作成済みHost namespaceを破棄し、Extension Runtime / Provider lifecycleをrollbackして停止状態へ遷移する。

rollback自体が失敗した場合は元のerrorとcleanup errorを`AggregateError`で保持する。

## 10. Active Execution Lease

Coreはactive application workを次のLeaseで管理する。

```ts
interface ExecutionLease {
  readonly signal: AbortSignal
  abort(reason?: unknown): void
  complete(): void
}
```

### 10.1 beginExecution

Extensionがrequest/session/task invocation等のactive workを開始するときに`beginExecution()`を呼ぶ。

Applicationが`running`でない場合は新規Leaseを拒否する。

これによりdraining開始後に新しいactive workを登録できない。

### 10.2 abort

`abort(reason)`はexecution-local cooperative cancellationをsignalする。

```text
abort
  -> signal.aborted = true
  -> active registryには残る
```

abortだけではactive execution countを減らさない。

Transportを実際にcloseする操作ではない。

HTTP client disconnectでいつabortするか、WebSocket drainでいつclose frameを送るかは各Extensionが決める。

### 10.3 complete

`complete()`はruntime workが完全に終了したことをCoreへ通知する。

```text
complete
  -> idempotent
  -> active registryから削除
  -> idle waiterを解放
```

complete時にsignalが未abortならexecution lifetime終了としてsignalをabortしてよい。

## 11. Shutdown order

Application shutdown orderは次に固定する。

```text
1. Application state -> draining
2. Extension Runtime drain()   定義順
3. active executions == 0 を待機
4. Extension Runtime close()   逆順
5. Provider / Module cleanup   逆順
6. Application state -> stopped
```

### drainの責務

```text
new ingressを止める
existing long-lived workへgraceful completionを要求する
```

### closeの責務

```text
active workが0になった後のExtension-owned resource cleanup
```

Extension runtimeの`close()`よりProvider cleanupを先に実行しない。Extension runtimeがProviderへ依存している可能性があるため。

WebSocket等のlong-lived executionでは、drainによるprotocol-specific graceful close完了後に`complete()`する。

## 12. Projection

Tooling projectionは**compiled contribution**から生成する。

```ts
project({ execution }) {
  // execution.compiled is canonical
}
```

生Definitionを再解析しない。

Graph IRへ出すExtension projectionはJSON-serializableでなければならない。

handler、factory、native socket、database client等のlive objectをGraphへserializeしない。

## 13. Generic Layerとの境界

Core generic Layerはprotocol-neutralなcomposition primitiveである。

```text
context
DI
state contribution
capability requirement
next()
outcome passthrough
```

Protocol-specific Layer compatibilityはExtensionが所有する。

HTTPならmiddleware short-circuit response variantとContract responseの整合性をHTTP Extensionが検証する。

WebSocketならsession/message semanticsをWebSocket Extensionが検証する。

Core Layer runtimeはHTTP statusやWebSocket close codeを解釈しない。

## 14. Package boundary

Execution Extension packageはCore公開rootだけへ依存する。

禁止例:

```ts
import '@loutrejs/loutre/http'
import { x } from '@loutrejs/loutre/internal'
require('@loutrejs/loutre/http')
```

境界テストは次を確認する。

```text
static import
side-effect import
dynamic import
require()
package dependencies
peerDependencies
devDependencies
source reverse dependency
```

Extension間依存は明示allowlist制とする。

現在はWebSocket handshake integrationのため`@loutrejs/websocket -> @loutrejs/http`を許可する。

## 15. Compatibility

Execution Extension化の対象外subsystemを、この再設計の都合だけで無関係に破壊しない。

Trigger Engineは本PRの対象外であり、`hello-worker`は既存利用体験を保つためlegacy Host pathを維持する。

新Extension APIはlegacy pathへ依存せず、将来Trigger EngineをExtension化する場合は別PRで移行する。

## 16. 完了条件

- Definitionはcompile onceでApplication Modelへ入る
- RuntimeとToolingは同じcompiled contributionを利用する
- Extension-specific validationをCoreへ持ち込まない
- Runtime Capability identity規則がModelとRuntimeで一致する
- Host API生成失敗がrollbackされる
- abortとcompleteの意味が分離される
- drain -> active 0 -> close -> provider cleanup順序がtestで固定される
- package境界にside-effect import / dynamic import / requireの抜け穴がない
- Extension author向け公開型だけで第三者Extensionを実装できる
