# ADR: Source Location Instrumentation

- 状態: **ACCEPTED / DESIGN FROZEN**
- 対象: Application Model / Graph / CLI Source Location
- 日付: 2026-09-13 JST
- Related:
  - `loutre_application_graph_kernel_architecture.md`
  - `loutre_runtime_support_policy.md`
  - `loutre_package_distribution_architecture.md`
  - `loutre_v0_3_architecture_direction.md`

## 0. 結論

LoutreのSource Locationは、Application semanticsを変更する機能ではなく、Graph / Explain向けの**best-effortなdeveloper metadata**として扱う。

Source Locationを得るためにruntime introspectionやDefinition objectの再解釈を追加しない。CLIがApplication entryを解析する段階で、Loutreのpublic define APIとclass declarationの静的に認識できる位置へsource metadata登録をinstrumentationし、そのmetadataをcanonical Application ModelからGraph IRへ伝播する。

```text
TypeScript / JavaScript source
        │
        ├─ SWC: parse / binding-aware source instrumentation
        │
        └─ esbuild: Application bundling / loading
                    │
                    ▼
             Application Model
                    │
                    ▼
                 Graph IR
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
         text      JSON     Mermaid
```

Source metadataはoptionalである。静的に安全に認識できない通常ケースでは、誤ったsourceを推測するよりmetadataを省略する。

## 1. Source Locationの意味

Source Locationは「runtime objectが最終的にどこから来たか」を一般的に追跡するprovenance systemではない。

Loutreが所有するdefine APIについて、**その定義を生成したpublic APIのcallsite**を記録する。

Canonical mappingは次とする。

- Module: `defineModule(...)` のcallsite
- Provider:
  - class provider: named class declaration
  - value / factory / conditional provider: `provide(...).use*()` のcallsite
  - `environmentProvider(...)` / `argumentsProvider(...)`: factory callsite
- HTTP Controller / Execution: `http.implementation(...)` / `defineHttpImplementation(...)` のcallsite
- HTTP Route: `http.contract(...)` / `defineHttpContract(...)` のcallsite
- HTTP Middleware: `http.middleware(...)` / `defineHttpMiddleware(...)` / `basicAuth(...)` / `bearerAuth(...)` / `cors(...)` のcallsite
- Handler: Controller / Implementationと同じcallsite

Handler objectのmethod property、factory内return位置、object literal property位置等へさらに細かいsourceを推測しない。

この決定により、handler factoryのcontrol-flow、複数return、shadowing、reassignment、spread、computed property等を解析して「実際のhandler生成位置」を復元する仕組みは持たない。

## 2. Metadata ownership

Source LocationはCoreの正式metadataとして次を持つ。

```ts
interface SourceLocation {
  readonly file: string
  readonly line?: number
  readonly column?: number
}
```

metadataは対象object自体へpropertyとして書き込まず、identityベースの外部registryで保持する。

- frozen object / classにもmetadataを付与できる
- user object shapeを変更しない
- metadata登録はfirst-write-winsとする
- aliasを後から観測してsourceを上書きしない

DefinitionやModule instanceをSource Location取得のためにModelへraw objectとして保存しない。Application Modelが保持するcanonical node / compiled contributionへ必要なsource snapshotだけを伝播する。

## 3. Soundness方針

Source metadataはbest-effortだが、**対応対象として認識するsyntaxではfalse positiveを避ける**。

特に次を守る。

- imported APIと同名のparameter / local / catch binding等をLoutre APIとして扱わない
- external class aliasをローカルclass declarationとして扱わない
- external call resultへローカルsourceを捏造しない
- `declare class`をruntime instrumentationしない
- type-only importをruntime API bindingとして扱わない
- aliasによる後勝ちsource上書きを行わない

そのためAPI認識はidentifier文字列だけで判定せず、SWCが解決したlexical binding identityを使用する。

現在のSWC ASTではbinding identityを `identifier.value + identifier.ctxt` で判定する。runtimeで`ctxt`を取得できない場合はfail-closedとし、名前一致へfallbackせず、そのbindingをinstrumentation対象外とする。

## 4. Import形式

Loutre public APIはnamed importとnamespace importの両方を認識する。

```ts
import { defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
```

だけでなく、次も対象とする。

```ts
import * as loutre from '@loutrejs/loutre'
import * as httpApi from '@loutrejs/loutre/http'

loutre.defineModule(...)
httpApi.http.contract(...)
httpApi.defineHttpImplementation(...)
```

namespace bindingについてもlexical binding identityを使い、同名parameter等によるshadowingを誤認しない。

## 5. Class provider

named class declarationはtop-levelだけに限定せず、function / block内を含むAST全体から収集する。

```ts
function createModule() {
  class NestedService {}
  return defineModule(() => ({ providers: [NestedService] }))
}
```

この場合も`NestedService`のclass declarationをSource Locationとして扱う。

named default-export classも既存のclass provider semanticsと同様に扱う。

```ts
export default class Service {}
```

一方、`declare class`はruntime valueを持たないためinstrumentationしない。

### 5.1 Decorator

Loutreはdecorator-first APIをcanonical architectureとして採用していない。Source Location instrumentationでも、user-authored class decoratorのsemanticsを解析・追跡しない。

特に、class decoratorがconstructorを別constructorへ置換するケースを検出・推論するための専用処理は追加しない。

これは意図した非目標であり、constructor replacement decoratorを使ったclassについてはSource Locationのsoundnessを保証しない。

Loutre自身のDefinition / DI / Graph semanticsはdecorator metadataへ依存しない。decorator対応のためだけにinstrumentation complexityを増やさない。

## 6. Parser / bundlerの責務分離

CLIは`esbuild`と`@swc/core`を併用するが、同じ責務を二重実装しているわけではない。

- **esbuild**: Application entryのbundling、dependency resolution、load可能な一時module生成
- **SWC**: 元sourceのparse、lexical binding-awareなSource Location instrumentation

Source Location実装ではSWCをcompiler / bundlerとして使わず、主にparserとして利用する。

逆にesbuild plugin APIだけで独自AST変換・binding identity解決を再実装しない。

「toolが2つある見た目」を理由にRspack等へ移行したり、SWC bundlerへ寄せたりしない。bundlingとsource analysisの責務が分離できている限り、依存の一本化自体を設計目標にしない。

将来parserを置換する場合も、Application bundlerとSource Location parserの境界を維持し、Source Locationのためにruntime / package architectureを変更しない。

## 7. OxcからSWCへ変更した理由

初期実装では`oxc-parser`を利用したが、Source Locationのfalse positiveを避けるには単なるsyntax parseではなく**lexical binding identity**が必要になったため、`@swc/core`へ変更した。Oxcはpre-1.0であり、この用途のためにOxc固有の制約と独自scope追跡を維持する理由はない。

この変更で、importされたLoutre APIと同名のparameter / local bindingをAST上で区別できる。CLI dependencyは`@swc/core: ^1.16.2`をbaselineとし、互換な新しいversionへ更新できる場合は通常どおり上げる。lockfile差分を小さくすることだけを理由にSWCを古いversionへ戻さない。

Oxc採用に伴って一時的に導入したCLI Node.js `>=22.12.0`制約は撤回する。CLIのruntime support policyをparser dependency都合で狭めない。

`@loutrejs/cli`はNode.js / Bun / Denoで動作するportable CLIであり、`engines.node`を宣言しない。runtime supportの正本は`loutre_runtime_support_policy.md`とする。

## 8. Source span / Unicode

SWCのsource spanはUTF-8 byte offsetとして扱い、JavaScript stringのUTF-16 indexへ直接使用しない。

Instrumentation insertion前にUTF-8 byte offsetからJavaScript string indexへのmappingを構築する。

これにより、source前方に日本語やemoji等のmulti-byte characterが存在しても、挿入位置・line / column・生成codeを壊さない。

この境界は回帰しやすいため、日本語とemojiがinstrumentation対象より前に存在するtestを恒久的に保持する。

## 9. Source code preservation

Instrumentationは元sourceの実行semanticsを壊してはならない。

少なくとも次を保持する。

- shebang
- directive prologue (`'use strict'`等)
- user codeとhelper名の衝突回避
- TypeScript / TSX / JSX / ESMのparse可能性
- Unicodeを含むsourceの正しいinsert位置

Source metadata取得のためにApplication semanticsを変更するtransformは認めない。

## 10. Instrumentationを有効にする範囲

Source instrumentationはGraph / Explain等、source metadataを利用するanalysis時だけ有効にする。

production `loutre build`では無効にする。

理由:

- production artifactへdeveloper metadata登録を混ぜない
- tree-shakingを阻害しない
- runtime behaviorへの副作用を持ち込まない
- parser / instrumentation dependencyをApplication runtime semanticsへ漏らさない

Source LocationはApplicationの正しさやRuntime実行に必要なmetadataではない。

## 11. Path policy

Application Model / Graph IRへ絶対pathを保存しない。

Source fileはproject rootからのrelative pathとして保持する。

Instrumentation対象はproject内sourceに限定し、少なくとも次は対象外とする。

- project root外のsource
- `node_modules`
- relative pathとして安全に表現できないsource

外部dependencyの定義元をLoutre project内sourceとして捏造しない。

## 12. Application Model / Graphへの伝播

Source Locationの収集経路は次の一方向とする。

```text
CLI source instrumentation
        ↓
identity metadata registry
        ↓
Application Model build
        ↓
Application Model node / Extension compiled contribution
        ↓
Graph IR
        ↓
text / JSON / Mermaid / explain
```

CLI rendererが元sourceやraw Definitionを再walkしてsourceを推論しない。

HTTP RouteはContract sourceを、HandlerはImplementation / Controller sourceを利用する。より細かい位置をruntime object shapeから逆算しない。

JSONでは`source`をmachine-readable objectとして保持する。text / Mermaid / explainは同じGraph IR metadataを表示用に整形するだけとする。

## 13. Non-goals

以下はSource Location機能の目的ではない。

- arbitrary JavaScript objectの完全なprovenance追跡
- external factory return valueの定義元推論
- handler method単位のcontrol-flow解析
- decorator semantics / replacement constructorの解析
- runtime stack traceからcallsiteを復元する仕組み
- source mapを使ったruntime callsite capture
- Source Locationのためのbundler置換
- Source Locationをproduction runtime requirementにすること
- metadataが得られないsyntaxを無理に推測すること

## 14. Regression test policy

Source Locationの過去のmerge blockerは、同じ論点を再発させないためtestとして固定する。

少なくとも次を恒久的に検証する。

- aliasでsourceが上書きされない
- external class / external call resultへlocal sourceを付けない
- `declare class`をruntime instrumentationしない
- shebang / directive prologueを壊さない
- helper名衝突を避ける
- production buildでtree-shakingを壊さない
- Route / Providerのvariable composition
- middleware factory source
- imported APIと同名bindingのshadowing
- `let` reassignment等を誤って追跡しない
- Unicode / UTF-8 byte span
- type-only import
- namespace import
- function / block内のnested class provider
- named default-export class

Decorator replacement constructorはSection 5.1の通り非目標であり、そのsoundnessを保証する回帰testは持たない。

## 15. Freeze

> **Source Location is optional developer metadata, not Application semantics.**

> **Record public definition callsites; do not build a general provenance engine.**

> **Within supported syntax, prefer missing metadata over fabricated metadata.**

> **Keep bundling and source analysis separate: esbuild bundles, SWC parses.**

> **Do not narrow portable runtime support to satisfy the instrumentation parser.**
