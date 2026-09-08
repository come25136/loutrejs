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

`executionDefinitionBrand`は`Symbol.for('loutre.execution-definition')`から得るglobal symbolとする。これにより別bundleまたは別Core copyの`defineExecution()`が作ったDefinitionも同じ論理brandとして認識する。Extension identity、Runtime Capability identity、Extension registry lookupも同じstable identity方針へ統一する。

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

  references?(definition: TDefinition): readonly ExecutionDefinition[]

  validate?(
    context: ExecutionExtensionValidationContext<TCompiled>,
  ): readonly Diagnostic[]

  createRuntime(
    context: ExecutionExtensionRuntimeContext<TCompiled>,
  ): TRuntime | Promise<TRuntime>

  projectGraph?(context: ExecutionProjectionContext<TCompiled>): unknown

  readonly host?: HostExtension<TNamespace, THostApi, TCompiled, TRuntime>
}
```

CoreはExtension名や`executionKind`の値でprotocol-specific分岐を行わない。

### 3.1 Execution reference closure

Extensionは`references()`で、あるDefinitionが同じExtension内で直接参照する別Execution Definitionを宣言できる。CoreはModuleのroot `executions`からこの参照を再帰的に辿り、同じDefinition objectは1回だけcompileしてcanonical Application Modelへ含める。参照関係はraw Definitionではなく`references` edgeとしてModelへ固定する。

```text
Module.executions: [heartbeat]
          │
          ▼
heartbeat --references--> hello task
          │                 │
          └──── compile ─────┘
                  │
                  ▼
        canonical Application Model
```

`references()`は同一Extension内だけを対象とする。別ExtensionのDefinitionを返した場合はModel diagnosticで拒否する。これによりRuntimeで合成されるHost APIと、Module root Definitionから導出するcompile-time Host API型を一致させる。参照先Executionは参照元と同じModuleのexecution closureとして扱う。

Definition objectはclosure構築中だけ利用し、Application Modelへraw objectとして保持しない。Runtime、Graph、CLI、Buildはcompile済みnode/edgeだけを見る。

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

Execution DefinitionのDIは、利用者へ`inject: []` metadataを要求しない。Implementation / Layer / Task等のfactoryでは、framework-managed classと同じくdefault parameterの`inject()`をdependency declarationとする。

```ts
factory: (users = inject(UserRepository)) => ({
  // ...
})
```

Extensionの`compile()`はこの同期constructionをdependency probeし、得られたtokenを`ExecutionContribution.dependencies`へ正規化する。Runtimeでは同じfactoryをInjection Context内で呼び、`inject()`を実値へresolveする。Application Modelの内部都合を公開Execution APIの`inject`配列へ漏らしてはならない。

このためImplementation、Layer、Taskのfactory constructionはpureであることを公開contractとする。factory本体ではhandler closureの組み立てと`inject()`によるdependency宣言だけを行い、I/O、timer、resource生成、business operationはhandler実行またはLifecycleへ置く。dependency probeとRuntime初期化の双方でfactory constructionが起こり得るため、factory construction自体のexactly-once実行には依存しない。

Factory Provider / Lifecycle hookのexplicit dependency metadataは別のCore APIであり、この原則の対象外とする。

## 5. Compiled Execution Contribution

Coreへ渡すcanonical contributionは次の形とする。

```ts
interface ExecutionContribution<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: string
  readonly executionKind: string
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
}
```

Coreが意味を理解するfield:

```text
id
executionKind as opaque identifier
dependencies
capabilities
```

`compiled`はExtension-owned opaque valueである。

Execution ownershipは`ExecutionContribution`や`ExecutionModelNode`へ重複保持しない。Coreは`ExecutionDefinition.extension`をdispatch keyとして`compile()`を呼び、Application Modelでは`ApplicationModelExtension { extension, executions }`だけをownerの正本とする。これによりowner不整合というinvalid stateを表現できなくする。

Extension固有のtoolingがcompiled型を取り戻す場合は、ordered typed registryである`ApplicationModel.extensions.get(extension)`を使う。`defineExecutionExtension()`はExtension名から`Symbol.for()`ベースのstable identityを生成し、registryとApplication内のowner groupingはこのidentityで行う。これによりCLIのesbuild bundle/import境界でdescriptor objectが複製されても同じExtensionとしてcompile・lookupできる。同じstable identityを持つdescriptorは同じ論理Extensionとして統合し、identityと名前の対応が矛盾する場合だけcollisionとして拒否する。heterogeneous storageからの型復元castはregistry実装内部だけへ局所化し、Core/Graph/RuntimeやExtension作者へ漏らさない。Coreはstable Extension identityをopaqueに扱うだけで、HTTP等の具体的な値による分岐は行わない。

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
compiled middleware composition diagnostic
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
middleware short-circuit response validation
```

可能なものはTypeScript上でも検出し、dynamic inputや型escapeに備えてruntime/model validationも持つ。

## 7. Runtime Capability

Runtime Capabilityはplatform/runtime primitiveへのtyped requirementである。

```ts
interface RuntimeCapability<TValue = unknown> {
  readonly kind: 'runtime-capability'
  readonly id: string
  readonly identity: symbol
}
```

### 7.1 identity

Capabilityの参照identityは**`id`から導出するglobal symbol identity**とする。

```ts
const HTTP_SERVER = runtimeCapability<HttpServerDriver>('http.server')
```

`runtimeCapability(id)`は`Symbol.for('loutre.runtime-capability:' + id)`を`identity`として持つ。したがって、bundle/import境界の両側で同じCapabilityを別token objectとして再生成しても、同じ`id`なら同じ論理Capabilityとしてlookupできる。token object自体の参照identityには依存しない。

`id`は次に利用するstable identifierである。

```text
Application Model node
Graph IR
diagnostic
logical capability identity
error message
```

同じ`id`から作られたCapability tokenは同じ`identity`を共有するため、Runtime bindingも同じCapabilityとして扱う。同一identityへの複数bindingは`LUTRE_CAPABILITY_DUPLICATE_BINDING`として拒否する。Capability idはApplication/bundle境界を跨いで衝突しない名前を選ぶ。

`identity`はCoreがopaqueなlookup keyとして扱い、HTTP等の具体Capabilityによる分岐には利用しない。

### 7.2 binding

```ts
interface RuntimeCapabilityBinding<TValue> {
  readonly capability: RuntimeCapability<TValue>
  readonly value: TValue
}
```

Runtimeは必要CapabilityがbindingされていることをExtension runtime生成前に検証する。

Runtime support profileに記録する文字列はruntime featureの記述にも利用できるが、Application compatibilityのrequired setへ入るのはExecution contributionがtyped `RuntimeCapability`として要求したものだけである。現行HTTP streamingは`Request`、`Response`、`ReadableStream`というLoutreのWeb Platform baseline上で実装され、別driver bindingを必要としないため、routeごとの追加Capabilityにはしない。各adapterのstreaming対応はruntime conformanceで保証する。

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
Tasks       -> app.tasks.run(task) / app.tasks.start() / app.tasks.stop()
MessagePort -> app.messagePort.handle(...)
```

Host APIの型はExtension identityからApplication型へ合成する。Coreへ`HasHttp`等の新しいprotocol hard-codeを増やさない。

Host namespaceはExtension間だけでなくApplication base APIとruntime adapter APIに対しても一意でなければならない。`graph`、`init`、`get`、`close`、`serve`、Promise同化を起こす`then`と、`__proto__`、`constructor`、`prototype`は予約し、Model validationで拒否する。Host application object自体もnull prototypeで構築する。

Tasksの`app.tasks.run(task)`は利用者向けergonomicsとしてDefinitionを受け取る。ただしHost境界でExtension-owned opaque Task execution identityへ解決し、Runtime dispatch、Trigger compiled model、validation、Graph projectionにはraw Task Definitionを渡さない。Triggerは`references()`でTaskを宣言するため、TriggerだけをModuleへ登録すれば参照先TaskもModelへ含まれる。Trigger engineの起動・停止は`app.tasks.start()` / `app.tasks.stop()`で行う。Queue descriptorのprivate property keyもglobal symbolにして、bundle copyが同じdescriptorを扱えるようにする。

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

server-streamを返すExecutionは、stream返却時にLeaseを完了せず、iteratorの正常終了、throw、consumerの`return()`、cancel、abortのいずれかまでownershipをstreamへ移す。完了処理はexactly-onceとし、Extensionの`drain()`は未完了streamへprotocol固有の停止要求を送る。

HTTP server-streamではExtension Runtimeが未完了streamのcontrolを保持する。`drain()`は新規requestを拒否した後、各Leaseをabortし、iteratorの`return()`とLeaseの`complete()`まで待機する。

## 11. Shutdown order

Application shutdown orderは次に固定する。

```text
1. Application state -> draining
2. Extension Runtime drain()   定義順
3. active executions == 0 を待機
4. Extension Runtime close()   逆順
5. Provider / Module cleanup   逆順
   a. onModuleDestroy
   b. beforeApplicationShutdown
   c. onApplicationShutdown
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

`drain()`が失敗したfailure pathではactive executionが自然終了する保証を失うため、Kernelは残るLeaseをabortしてcooperative cancellationを要求する。その後もactive registryから強制削除せず、active executions == 0を安全境界として維持する。

協調停止は`forceShutdownTimeoutMs`（既定値5秒）まで待機する。期限内にactive executions == 0へ到達すればExtension `close()`とProvider cleanupを続行し、drain errorを最後の`AggregateError`へ保持する。期限を超えた場合はExtension `close()`とProvider cleanupを実行せず、Applicationを`draining`に保ったまま`AggregateError`を返す。残存Executionが後で`complete()`した後はshutdownを再試行できる。このfailure pathでは「完了していないExecutionが利用中のProviderをcleanupしない」ことをtotal completionより優先する。

初期化rollbackでは、構築済みProvider instanceと初期化完了済みModuleを追跡する。未到達ModuleのLifecycle hookを実行せず、cleanup dependency解決を通じて未初期化Providerを新規constructしない。

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

Protocol-specific Layer semanticsはExtensionが所有する。

HTTPならmiddleware short-circuit response variantとContract responseの整合性をHTTP Extensionが検証する。

WebSocketならsession/message semanticsをWebSocket Extensionが検証する。

Core Layer runtimeはHTTP statusやWebSocket close codeを解釈しない。

## 14. Package / source boundary

Execution Extensionのarchitecture境界はnpm package分割を必須としない。HTTPは`@loutrejs/loutre/http` subpathとして本体packageへ配置するが、Core/application/runtimeから`packages/loutre/src/http`への逆依存は禁止する。HTTP sourceからNode.js built-inへの依存も禁止し、runtime-neutralなWeb Platform APIだけを利用する。

別packageとして配布するExtensionはCore公開rootだけへ依存し、internal sourceへ依存しない。境界テストはstatic import、side-effect import、dynamic import、require、package dependencies、peerDependencies、devDependencies、source reverse dependencyを確認する。

これらのsource boundaryはdependency-cruiserでCI enforcementする。Extension間依存は明示allowlist制とし、現在はWebSocket handshake integrationのため`@loutrejs/websocket -> @loutrejs/loutre/http`を許可する。

## 15. Migration completion

Execution semanticsはExtensionへ一本化する。Task / Trigger / Queue Consumer、MessagePort、HTTP、WebSocketの各実行経路はApplication ModelのExtension registryからRuntimeとHost APIを構成し、Core側に別系統のexecution hostを残さない。

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
