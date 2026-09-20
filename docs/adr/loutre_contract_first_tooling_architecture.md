# Loutre Contract-first Tooling Architecture

ステータス: Accepted

日付: 2026-09-20 JST

Related: `loutre_openapi.md`, `loutre_application_graph_kernel_architecture.md`, `loutre_execution_extension_contract_architecture.md`

Overrides: `loutre_openapi.md` のうち、OpenAPI生成は常にcompiled HTTP Executionをsource of truthとし、CLIはApplication ModelだけをOpenAPI toolingへ渡す、とした制約。

## Context

LoutreではApplication Modelを、実行可能なApplicationのcanonical representationとして扱う。Module、Provider、Execution、dependency、Runtime Capability、diagnosticなど、Application全体の構造と実行可能性はApplication Modelを通して確定する。

一方、HTTP APIのmethod、path、request schema、response schema、metadataは`HttpContract`を定義した時点ですでに存在する。これらの情報だけを必要とするtoolingに対して、implementation、Module、Applicationを追加しApplication Modelを構築することを必須にすると、API設計だけを先行するworkflowに不要なruntime topologyを要求することになる。

代表例はOpenAPI生成である。

```ts
const contract = http.contract({
  getUser: {
    method: 'GET',
    path: '/users/{id}',
    // ...
  },
})
```

このContractからOpenAPIを生成するためだけに、次のようなimplementationとApplicationを用意する必要はない。

```ts
const implementation = http.implementation({
  contract,
  factory: () => ({/* ... */}),
})

export default defineApplication({
  modules: [/* ... */],
})
```

Contract-first toolingを許可する一方で、Application Modelが持つcanonical boundaryを曖昧にしてはならない。個別toolingがraw Definitionを自由に再解釈し始めると、runtime、Graph、CLI、toolingでvalidationやnormalizationが分岐するためである。

## Decision

Toolingは、そのtoolingが必要とする情報を完全に表現できる**最小のcanonical source**を入力として利用する。

```text
HttpContract
    │
    ├── Contract-only Tooling
    │     └── OpenAPI
    │
    └── HttpImplementation
            │
            ▼
      Application Model
            │
            ├── Runtime
            ├── Graph / DevTools
            ├── DI / Capability validation
            └── Application-aware Tooling
```

Application ModelとHttpContractは競合するsource of truthではない。責務が異なる。

- `HttpContract`はHTTP API contractのcanonical representationである。
- `ApplicationModel`は実行可能なApplication topologyのcanonical representationである。
- toolingがHTTP contractだけで完結する場合は`HttpContract`を直接consumeできる。
- toolingがModule、DI、Execution ownership、Runtime Capability、Application-wide diagnosticなどを必要とする場合はApplication Modelをconsumeする。

Contract-firstを理由に、Application Modelが必要なtoolingまでraw Definitionへ戻してはならない。

## OpenAPI

OpenAPI生成のpublic APIは次を受け取る。

```ts
type OpenApiSource = ApplicationModel | HttpContract

function generateOpenApi(
  source: OpenApiSource,
  options: GenerateOpenApiOptions,
): OpenApiDocument
```

Contract-firstではApplicationやimplementationを要求しない。

```ts
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'

const document = generateOpenApi(contract, {
  info: {
    title: 'Example API',
    version: '1.0.0',
  },
})
```

Applicationが存在する場合は、従来どおりApplication Modelを入力にできる。

```ts
const document = generateOpenApi(application.model, {
  info: {
    title: 'Example API',
    version: '1.0.0',
  },
})
```

Application Model経由ではHTTP Extensionのcompiled executionを利用する。Contract直接入力ではresolved `HttpContract`を利用する。

## Projection equivalence

同じ`HttpContract`だけをHTTP sourceとして持つApplicationでは、implementationやApplicationの存在によってHTTP contractのOpenAPI projectionが変わってはならない。

概念的に次をinvariantとする。

```text
generateOpenApi(contract)
        ==
generateOpenApi(applicationUsingOnly(contract).model)
```

Applicationが他のHTTP Executionも持つ場合は、当該Contract由来operationのprojectionがContract直接入力と一致することを要求する。ここでの同値性は、同じOpenAPI optionsに対してmethod、path、request / response schema、metadata、operation ID contextなどの意味と構造が一致することを指す。

このinvariantを維持するため、Contract直接入力とApplication Model経由で次のnormalization / validation semanticsを共有する。

- HTTP methodのcanonical form
- path parsing
- path parameter名を除いたdispatch identity
- duplicate route conflict判定
- route definitionが持つrequest / response metadataのprojection

例えば次の2routeはparameter名が異なっても同じdispatchとして衝突する。

```text
GET /users/{first}
GET /users/{second}
```

Contract-first側だけがこれを許可したり、Application Model側だけが拒否したりしてはならない。

共有できるvalidationとnormalizationはHTTP内部utilityへ置き、OpenAPI実装とExecution Extensionで同じ判定を利用する。各consumerがdispatch ruleを独自実装しない。

## Contract construction boundary

Contract-first toolingが受け取るのは任意のroute-like objectではなく、`http.contract()`が生成した`HttpContract`である。

`http.contract()`はnested routeの解決、path validation、response inheritanceなど、Contract単体で確定できるHTTP semanticsを構築時に確定する。

そのためOpenAPI toolingは生の`HttpContractRouteTree`を再解釈しない。resolved `HttpContract.routes`をconsumeする。

```text
HttpContractRouteTree
        │
        ▼
   http.contract()
        │
        ▼
 resolved HttpContract
        │
        ├── OpenAPI
        └── HttpImplementation -> Application Model
```

## Application Model boundary

Contract-first toolingの導入後も、次の情報はApplication Modelなしではcanonicalに確定しない。

- Module ownership / visibility
- Provider dependency graph
- Execution ownership
- Extension-wide global validation
- Runtime Capability requirements
- deployment/runtime compatibility
- Runtime / Graph / DevTools topology

これらを必要とするCLI commandやtoolingは引き続き`ApplicationDefinition` / `ApplicationModel`を要求する。

したがって`check`、`doctor`、`graph`、`explain`、`build`、`dev`などのApplication commandへ`HttpContract`を直接渡すことはしない。

## CLI entry boundary

CLIのentry bundling / import自体はApplication固有の責務ではないため、genericなentry loaderとして分離する。

```text
entry.ts
   │
   ▼
entry-loader
   │
   └── default export: unknown
          │
          ├── Application command
          │      └── ApplicationDefinitionを要求
          │
          └── openapi command
                 └── ApplicationDefinition | HttpContractを要求
```

entry loaderはexportされた値のdomain semanticsを判定しない。bundleしてdefault exportを返すことだけを担当する。Application loaderやOpenAPI CLIが、それぞれ必要なkindを検証する。

### Default exportをcanonical entryとする

Loutre CLI entryはdefault exportだけをcanonical entryとする。

```ts
export default defineApplication({/* ... */})
```

```ts
export default http.contract({/* ... */})
```

`export const application = ...`のようなnamed export fallbackは行わない。

理由は、generic entry loaderが複数domainを扱う状況で名前による暗黙探索を続けると、commandごとにfallback ruleが増え、entryのidentityが曖昧になるためである。

CLIは「どの値がentryか」をdefault exportで一意に決め、その値がcommandに適合するかをdomain側で検証する。

## Validation ownership

validationは、そのruleをcanonicalに所有する層へ置く。

- route単体で判定できるmethod/path/request/response整合性はHTTP Contract / route compilation層
- route集合のdispatch conflictのようにContract-firstとApplication Modelの両方で必要なHTTP ruleは共有HTTP validation
- Module / DI / Capability / Execution ownershipはApplication Model validation
- OpenAPI表現固有の制約はOpenAPI projection

OpenAPI生成のためだけにApplication Model validationへHTTP Contract ruleを隠さない。また、Application Model側とContract-first側に同じHTTP ruleをコピーしない。

## Scope

この判断は「すべてのDefinitionをApplication Modelなしでtoolingへ渡してよい」という一般ルールではない。

新しいContract-first toolingを追加する場合は、少なくとも次を満たす必要がある。

1. toolingが必要とする情報を対象Contractだけで完全に表現できる
2. Application Model固有情報を暗黙に推測しない
3. Application経由と直接入力の両方が存在する場合、共有semanticsの同値性を定義できる
4. validation / normalizationをconsumer間で複製しない
5. raw Definition treeではなく、対象domainが確定したcanonical Contractを入力にする

これを満たさないtoolingはApplication Modelを入力とする。

## Consequences

API設計をimplementationより先に進められるため、OpenAPI生成、client/server code generation、AgentによるAPI設計レビューなど、Contractだけで完結するworkflowをApplication構築から切り離せる。

一方で、Contract-first pathとApplication Model pathの2つの入力経路を持つtoolingにはprojection equivalenceを維持する責務が生じる。共有validation / normalizationとequivalence testを、この分岐を安全に保つための必須条件とする。

Application Modelは引き続きruntimeとApplication-aware toolingのcanonical representationであり、Contract-firstの導入によってその責務を縮小しない。

## Non-goals

- `HttpContract`だけからApplication Modelを合成すること
- implementationやhandlerをOpenAPI生成時に推測すること
- Application commandへContractを直接渡せるようにすること
- raw Execution DefinitionをApplication Modelの代わりにGraph / Runtime / DevToolsへ渡すこと
- entry file内のnamed exportを探索してcommandごとに暗黙選択すること
- Contract-first入力とApplication Model入力で異なるHTTP semanticsを許容すること
