# Loutre Architecture

- 状態: 実装済み基準
- 対象: Loutre v0.1
- 更新日: 2026-08-24 JST

## 1. Architecture Principle

Loutreは、明示的なApplication Graphを中心にContract、Protocol、Pipeline、DI、
Lifecycle、Runtime Capabilityを統一的に扱うTypeScript Application Frameworkである。

```text
                 Loutre

             Application Graph
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   Type System    Runtime      Tooling
                                │
                                ├ graph
                                ├ check
                                ├ explain
                                └ doctor
```

設計原則は`Graph-first, type-safe runtime`とする。TypeScript Source Compiler、
Runtime Linkage Artifact、decorator metadataはApplication Graphの成立条件ではない。

## 2. Package Boundary

```text
@loutrejs/core
├ Contract / Procedure / Protocol descriptor
├ Module / Provider / Token
├ inject() / Injection Context
├ Pipeline / Layer / Context Key
└ Lifecycle descriptor

@loutrejs/graph
├ ApplicationGraphIR
├ runtime descriptor traversal
├ Graph Probe / Dependency Recorder
├ semantic validation
└ graph serialization source

@loutrejs/runtime
├ synchronous Container
├ application / transient scope
├ Lifecycle execution
└ Pipeline execution

@loutrejs/http / @loutrejs/message-port
├ protocol descriptor
├ transport decode / encode
└ implementation invocation

@loutrejs/cli
├ graph / check / explain / doctor
├ build
└ dev / start
```

`@loutrejs/compiler` packageは存在しない。Runtime packageはTypeScript compiler APIや
Node.js固有のDI context機構へ依存しない。

Moduleの`name`は開発用Graph表示の任意metadataである。未指定でもruntime correctnessへ
影響せず、Graph上では安定した内部IDへfallbackする。

## 3. Dependency Injection

### 3.1 Public API

class tokenとcustom tokenは、同じ`inject()`で宣言する。

```ts
import { inject, token } from '@loutrejs/core'

const DATABASE = token<Database>('database')

class UserRepository {
  constructor(readonly database = inject(DATABASE)) {}
}

class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

constructor default parameterを標準形とする。unit testでは通常のconstructor argumentで
dependencyを置換でき、この場合`inject()`は評価されない。

```ts
const service = new UsersService(mockRepository)
```

`@Injectable()`、`@Inject()`、`experimentalDecorators`、`emitDecoratorMetadata`、
`reflect-metadata`は要求しない。

### 3.2 Injection Context

`inject()`はframework-managed class construction中だけ利用できる。method bodyなどから
呼ぶと`LUTRE_DI_CONTEXT`で失敗する。contextは同期のstack disciplineと`try/finally`で
復元し、`AsyncLocalStorage`を利用しない。

```text
inject(token)
    ├ dependency declaration
    ├ synchronous dependency resolution
    └ consumer → dependency edge recording
```

request、session、current user、tenantなどのexecution dataはDIへ置かず、型付き`ctx`で
伝播する。

### 3.3 Managed Class

Containerがconstructionできるclassは次に限定する。

- Module `providers`へ明示したclass
- `useClass` implementation
- conditional Providerのcandidate
- Contract / Protocol implementation binding
- framework built-in

未宣言classの暗黙auto-resolutionは`LUTRE_DI_UNRESOLVED`で拒否する。DI cycleは
`LUTRE_DI_CYCLE`で拒否し、cycle回避APIは提供しない。

### 3.4 Scope

Phase 1のscopeは`application`と`transient`である。application scopeはtokenごとに一つの
instanceをcacheし、transientは解決ごとに新しいinstanceを生成する。Lifecycle保証を持つのは
application-scoped managed instanceだけである。

### 3.5 Synchronous Construction

`Container.resolve()`、class constructor、`inject()`、factory Providerは同期処理である。
factoryがthenableを返すと`LUTRE_DI_ASYNC_FACTORY`でfail-fastする。

DB、Redis、Kafka、socket、watcherなどのresource acquisitionとcleanupはconstructorから
分離し、非同期Lifecycle hookで実行する。

## 4. Application Graph

Application Graphは少なくとも次の情報を持つ。

- Module / Provider graph
- DI node / dependency edge
- Contract / Procedure / Protocol binding
- Pipeline / Context requires-provides
- implementation binding
- Lifecycle dependency
- conditional branch
- Runtime capability requirement
- diagnostics

DI edgeはfirst-class IRとして、`kind`と取得元を保持する。

```ts
interface DependencyEdgeIR {
  readonly from: string
  readonly to: string
  readonly kind: 'inject' | 'factory' | 'lifecycle' | 'conditional' | 'framework'
  readonly source: 'declared' | 'probed'
  readonly condition?: {
    readonly key: string
    readonly equals: PropertyKey
  }
}
```

JSON graphは`version: 2`、再帰的な`LayerIR.pipeline`、`nodes`、`edges`、`diagnostics`を
持つmachine-readable interfaceである。Layer factoryが`inject()`した依存は、pipeline内の
index pathで識別される`kind: 'layer'` nodeから`source: 'probed'`のinject edgeとして表現する。

## 5. Graph Builder / Graph Probe

Graph構築順序は次のとおり。

```text
Application entry evaluation
        ↓
runtime descriptor traversal
        ↓
Declared Graph
        ↓
Graph Probe Container
        ↓
全managed classをLifecycleなしでconstruction
        ↓
inject() edgeをrecord
        ↓
ApplicationGraph + diagnostics
```

Graph Probeはapplication / transient class Provider、implementation、`useClass`、conditionalの
全candidateを対象とする。現在選択されていないconditional branchもprobeするため、productionで
だけ選ばれるbroken dependencyも開発・CIで検出できる。

ProbeはLifecycle hook、server listen、外部接続、listener、watcher、long-running timerを実行しない。
このためmanaged constructorはdependency wiringと軽量な同期初期化だけを行う。

unresolved dependencyやcycleがあっても、取得済みnode/edgeとdiagnosticを保持したpartial graphを返す。

## 6. Unified Validation

Contract coverage、Pipeline、DI、Module、Runtime capabilityのsemantic validationは
`@loutrejs/graph`の一実装をsource of truthとする。

```text
ApplicationGraph
      │
      ├ Runtime creation
      ├ loutre check
      ├ loutre graph
      ├ loutre explain
      └ loutre doctor
```

Runtime、CLI command、protocol packageごとに別validatorを持たない。

## 7. CLI

CLIはfilesystem discoveryを行わず、Graphを必要とするcommandではentryを明示する。

```sh
loutre graph di --entry src/app.ts --format text
loutre graph di --entry src/app.ts --format json
loutre graph di --entry src/app.ts --format mermaid
loutre check --entry src/app.ts
loutre explain UsersService --entry src/app.ts
loutre doctor workerd --entry src/app.ts
```

`graph di`はscope、custom token、conditional edge、cycle、unresolved nodeを表示する。
broken graphではpartial graphを出力してからdiagnosticを表示し、終了code 1を返す。

`build`は通常のTypeScript bundlingへ委譲し、source rewriteやconstructor dependency arrayを
生成しない。Graph ManifestはApplicationGraphから生成する。`dev`と`start`もentryを直接loadし、
Runtime Linkage Artifactを介さない。

### 7.1 Recursive Pipeline

PipelineはLayer、Validation、Terminalからなる順序付き再帰sequenceである。Layerはdefinition
object内にstatic metadataと同期factoryを持つcallable objectであり、種類は1つだけである。

```text
Pipeline
├ Layer
├ Layer(child Pipeline)
│  ├ Layer
│  └ Layer(child Pipeline)
│     └ Layer
└ Terminal
```

LayerをそのままPipelineへ置くと、`next()`はその位置以降を実行する。同じLayerを
`layerA([...])`のように呼ぶと、factoryを再実行せず、その利用箇所だけにchild Pipelineを関連付ける。
この場合の`next()`はchildだけを実行し、Layer runtimeがreturnした後に親Pipeline後段へ進む。

Layer factoryはApplication construction時にInjection Context内で同期実行し、runtime functionを
保持する。runtime functionは`(ctx, next)`だけを受け取る。`ctx`には`requires`で宣言したContextだけを
公開し、`provides`がある場合は`next(provided)`の直前にContextへ追加する。

正常終了には`next()`をちょうど1回呼ぶか、`next()`の代わりに`shortCircuit()`を返す必要がある。
Runtimeはnextのskip/reentry、next後のshortCircuitを拒否する。downstream errorをLayerがcatchしても、
Pipelineは保持した元errorを再throwする。

Context providesとvalidation stateはchildがcontinueした場合に親後段へ伝播する。Logical terminalは
depth-first順で全体にexactly one、かつ最後のitemでなければならない。Protocol Finalizationは
`executePipeline()`完了後に実行する。

## 8. Lifecycle

Application initializationとshutdownは非同期でよい。constructionとresource lifecycleを分離する。

```text
Construction
├ synchronous dependency wiring
└ no external resource acquisition

Lifecycle
├ asynchronous initialization
├ I/O / connection / verification
├ initialization failure時のreverse rollback
└ best-effort shutdown
```

Graph ProbeではLifecycleを実行せず、module Lifecycle hookの`inject` declarationだけを
declared edgeとして収集する。

初期化途中で失敗した場合、対象となったapplication-scoped instanceとmoduleを逆順にcleanupする。
cleanupも失敗した場合は初期化errorを先頭にした`AggregateError`を投げる。shutdownは個別hookが
失敗しても残りを続行し、全cleanup後にerrorを`AggregateError`として報告する。

## 9. Runtime Portability

DIとGraph Probeのcoreで利用するprimitiveは`Map`、`Set`、`WeakMap`、`try/finally`、class、
function、`Symbol`に限定する。PromiseはLifecycleとprotocol executionで利用する。

conformance対象はNode.js、Bun、Deno、workerd、AWS Lambda、Electronである。

## 10. Testing Contract

変更時は最低限、次を維持する。

- class/custom tokenの同期`inject()`
- Injection Contextのnested復元と例外復元
- application/transient scope
- async factory拒否
- conditional全branch probe
- lifecycle非実行
- factory/lifecycle/conditional/inject edge
- unresolved/cycleのpartial graph
- graph text/json/mermaid
- check/explain/doctorのGraph共有
- compiler/linkageなしのbuild/dev/start
- 全runtime conformance

詳細な移行判断とAcceptance Criteriaは
[`docs/loutre_source_compiler_removal_architecture_amendment.md`](./docs/loutre_source_compiler_removal_architecture_amendment.md)
を参照する。
