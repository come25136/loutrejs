# CoreのApplication Model IDへのBranded Types導入

- 状態: 採用
- 日付: 2026-10-26
- 対象: Core Application Model、Graph projection、Runtime、Execution Extension境界
- 関連: [DevTools IDへのBranded Types導入](loutre_devtools_branded_ids.md)
- 全体方針: [Loutre全体へのBranded Types導入](loutre_branded_types_adoption.md)
- 関連: [Application Graph Kernelのアーキテクチャ](loutre_application_graph_kernel_architecture.md)

## 背景

CoreのApplication Modelでは、Module、Provider、Execution、Lifecycle、Framework nodeのIDとedgeの端点がすべて`string`になっている。Runtimeの`#providerInstances`はModule IDをキーにするが、型は`Map<string, unknown[]>`である。Provider IDを渡しても検出できない。

Coreでbrandを付け、Model構築からGraph projectionとRuntimeまで同じ型を保持すると、所属Moduleの指定、初期化状態の参照、依存edgeの接続先の取り違えを防げる。DevToolsのTrace IDとは所有者も寿命も異なるため、Coreが自分のIDを定義する。

## 決定

### Model nodeの種類を区別する

`core/model/identity.ts`に型を定義し、Coreのpublic facadeとpackage rootから公開する。このファイルは他のModel実装やDevToolsへ依存しない。

```ts
type ModelId<Kind extends string> = string & {
  readonly '~loutre.model-node-id': Kind
}

export type ModuleId = ModelId<'module'>
export type ProviderNodeId = ModelId<'provider'>
export type ExecutionNodeId = ModelId<'execution'>
export type LifecycleNodeId = ModelId<'lifecycle'>
export type CapabilityNodeId = ModelId<'capability'>
export type ExtensionNodeId = ModelId<'extension'>

export type ModelNodeId =
  | ModuleId
  | ProviderNodeId
  | ExecutionNodeId
  | LifecycleNodeId
  | CapabilityNodeId
  | ExtensionNodeId
```

`ProviderNodeId`はTokenの表示用`id`、`CapabilityNodeId`はRuntime capabilityの論理的な`id`と区別する。値が似た文字列でも、同じ識別対象でないものは同じ型にしない。

公開brandの型キーは安定した名前とし、異なるpackage copyでも同じ契約を表す型は構造的に互換にする。このpropertyを実行時に追加・検査するわけではない。privateなunique symbolとの使い分けは[全体方針](loutre_branded_types_adoption.md)に従う。

`FrameworkModelNode`は`frameworkKind`により`CapabilityNodeId`と`ExtensionNodeId`が対応するunionにする。`kind: 'framework'`と既存のJSON表現は維持する。

### 所属先とNode IDを分ける

ExecutionとLifecycleの`moduleId`には`ModuleId`を使う。ProviderにはApplicationが所有するArguments providerがあり、現在`moduleId: 'application'`で表現される。ここだけは`ModuleId | 'application'`とし、`'application'`を架空のModule nodeとしてbrand化しない。

将来の所有者表現を今回まとめて変更する必要はない。Application所有かをnarrowしてからModule単位の処理へ渡す。`'application'`を`ModelNodeId`のunionに含めず、edgeの端点にもできないようにする。

Runtimeの`#providerInstances`を`Map<ModuleId, unknown[]>`、`#initializedModuleIds`を`Set<ModuleId>`へ変更する。`providerNodesOfModule`、`lifecycleHookOf`、`#runCleanupHook`なども`ModuleId`を受け取る。これによりIDの型が実際のlookupまで保持される。

### Edgeの意味と端点を対応させる

`from`と`to`を単に`ModelNodeId`にするだけでは、存在し得るNode同士の誤った接続を防げない。`ApplicationModelEdge`を`kind`でnarrowできるunionにし、現在生成しているedgeを以下の契約にする。

| kind         | from                                                     | to                                                       |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| `owns`       | `ModuleId`                                               | `ProviderNodeId` / `ExecutionNodeId` / `LifecycleNodeId` |
| `imports`    | `ModuleId`                                               | `ModuleId`                                               |
| `exports`    | `ModuleId`                                               | `ProviderNodeId`                                         |
| `injects`    | `ProviderNodeId` / `ExecutionNodeId` / `LifecycleNodeId` | `ProviderNodeId`                                         |
| `references` | `ExecutionNodeId`                                        | `ExecutionNodeId`                                        |
| `requires`   | `ExecutionNodeId`                                        | `CapabilityNodeId`                                       |
| `starts`     | `ExtensionNodeId`                                        | `ExecutionNodeId`                                        |

`wraps`は現在の型に存在するがModel builderには生成箇所がない。今回その意味を推測して狭めず、`ModelNodeId`同士の契約を維持する。実際に生成する機能を導入するときに端点の種類を決める。

brandが同じでも、別ModelのNodeや未登録のIDは作れる。Nodeの実在性、全種類を横断した文字列としてのID衝突、Module visibility、依存循環の検証はRuntime / Model validationの責務として残す。

### Extensionの宣言からModelへ変換する境界

Extension authorが返す`ExecutionContribution.id`は宣言用の文字列を維持する。任意の識別子を返すたびに利用者へcastやbrand constructorを要求しない。

Model builderがcontributionを取り込み、衝突などの検証を行う境界で`ExecutionNodeId`を確定する。内部生成のModule、Provider、Lifecycle、Framework IDは、それぞれのModel用生成関数で確定する。変換関数はModel内部に置き、汎用の公開`asModelId<T>()`は提供しない。

ただし、現在の`ExecutionRuntimeBinding.execution`は`ExecutionContribution`を型として使っており、そのままではRuntimeへ渡すときにbrandが消える。Runtime binding、Extension validation、Graph projectionが受け取るModel由来のcontributionには、`ExecutionContribution<T> & { readonly id: ExecutionNodeId }`を使う。compileの戻り値とModel由来の入力の契約を分け、Core内で一度確定したIDを再変換しない。

```mermaid
flowchart LR
  declaration["Extensionの宣言用ID: string"] --> builder["Model builder・検証"]
  generated["Model内部のID生成"] --> builder
  builder --> model["Application Model: 種類別のNode ID"]
  model --> graph["Graph IR"]
  model --> runtime["Runtime・Extension binding"]
  model --> validation["Extension validation / projection"]
  runtime --> instrumentation["Core instrumentation metadata"]
  instrumentation --> devtools["DevTools"]
  graph --> json["JSONでは文字列"]
```

### Graphとinstrumentationでも意味を保つ

Graph IRの`id`とedgeにはModel由来の型を保持し、Graph層で別のbrandを作らない。`GraphNodeIR.module`は現行のApplication所有Providerも表現できるように`ModuleId | 'application'`にする。GraphのJSONを読むWebsiteなどは、受信側の境界で自分の型へ変換する。

`RuntimeProviderMetadata.providerId`は現在Provider nodeのIDを受け取るため、`ProviderNodeId`へ変更する。`graphNodeId`には`ModelNodeId`を使い、Provider metadataでは`ProviderNodeId`まで狭める。同じProvider nodeを参照する二つのフィールドに別のbrandは付けない。

一方、`RuntimeExecutionMetadata.executionId`には`http.not-found`やProvider method、custom spanなど、Model nodeに対応しない実行の識別子も入る。このフィールドは`RuntimeExecutionId = ExecutionNodeId | SyntheticExecutionId`とする。合成IDはCoreの種類別factoryで確定し、公開APIでcustom executionを記録する利用者にもその入口を提供する。`graphNodeId?: ModelNodeId`には合成IDを渡せない。Modelに対応するExecutionは`ExecutionNodeId`を変換せず渡す。

DevToolsがModel IDを受け取る場合もCoreの型を参照する。依存はDevToolsからCoreへの一方向とし、CoreにTraceやCapsuleの型を持ち込まない。

## その他のCoreの候補

| 対象                                      | 判断                      | 理由                                                                                                                                       |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CapabilityとExtensionの`identity: symbol` | 採用する                  | 種類別のsymbol brandでRegistryのkeyの取り違えを防ぐ。`Symbol.for`によるbundle間の実行時同一性は維持する。論理IDとModel node IDも区別する。 |
| `Token<T>`の`id`                          | 表示文字列を維持する      | DIはToken object / classをキーにし、表示用文字列をキーにしていない。factory出力と`key`の型付けは全体設計に含める。                         |
| `Token<T>`やCapabilityのdescriptor自体    | factory出力をopaqueにする | 入力の宣言型と出力を区別する。ただし同じ値型のTokenごとの公称的な区別は、共通のbrand一つでは実現できない。                                 |
| `Type<T>`・`ExecutionDefinition`          | 現状を維持                | すでにunique symbolの型情報や実行時brandがある。特にExecution Definitionのbundle間認識を、型だけのbrandで置き換えない。                    |
| Schemaの入出力                            | 現状を維持                | Schemaのoutput型を保つことで、利用者がSchema側で定義したbrandも伝播できる。一律の「検証済み」brandは追加しない。                           |

## 導入順序と互換性

1. ModelのID、所有者、edge、builderでの変換を導入する。
2. Graph、Runtime、ExtensionのModel由来の入力、instrumentation metadataへ同じ型を通す。1と2を一つの整合した変更として完成させる。
3. DevToolsの設計と接続し、Model IDはCore、sessionとTraceのIDはDevToolsという所有関係を維持する。全体の実装順と完了範囲は[全体方針](loutre_branded_types_adoption.md)に従う。

既存の文字列値とJSON形式は維持する。公開Model、Graph、instrumentation metadataを手書きする利用者にはTypeScriptの破壊的変更となるため、[全体方針の移行案内](loutre_branded_types_adoption.md#互換性と移行)に従う。外部のinstrumentation実装はModel由来のIDを受け取り、そのまま転送できる。syntheticなexecution IDを指定するコードはCoreのfactoryで値を確定する。

## 検証方針

- 型テストで、Provider nodeのIDをModuleのlookupへ渡せないこと、`imports`や`injects`の端点を取り違えられないこと、Application所有をnarrowせずModuleの処理へ渡せないことを確認する。
- ModelからExtension runtime、Graph、instrumentationへ渡す途中でIDが単なる`string`へ広がらないことを型テストで確認する。Extensionのcompileは従来どおり文字列IDを返せることも確認する。
- `SyntheticExecutionId`は`executionId`へ渡せるが、`graphNodeId`やExecution nodeのlookupには渡せないことを確認する。
- 既存のModel identity regression testで、文字列としてのID衝突、Extension / Capabilityのbundle間lookup、Execution Definitionのbrand認識を検証する。
- Arguments provider、Module初期化とcleanup、各Execution Extensionのinstrumentationを既存テストで確認する。Modelを手書きするfixtureの変換は専用helperに集約する。
- `npm run check`、`npm run test:types`、`npm run check:dependencies`、関連するModel / Runtime testとbuildを実行する。
