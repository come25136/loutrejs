# Nested Contract Composition and Resolved Implementation Binding

ステータス: Accepted

## Context

LoutreのHTTP Contractは、各procedureに`method`、`path`、`request`、`responses`、`pipeline`を持たせ、ContractをImplementation、OpenAPI、Typed Client、Application Graphなどのsource of truthとして扱う。

一方、実際のApplicationでは、route単位の定義だけでは表現しづらい横断的な要求がある。

例えば以下のような要求である。

- `/api`配下へ複数のHTTP Contractをまとめたい
- `/me/*`配下では認証済みであることを構造的に保証したい
- rate limit、logging、tracing等をあるHTTP subtree全体へ漏れなく適用したい
- 親のpipelineが`provides`したContextを、子routeのController Handlerで型安全に利用したい
- Contractをfeature単位で分割しつつ、Application全体では1つのContract treeとして再構成したい
- Implementationをroot Contract上の特定nodeへbindし、rootからそのnodeまでに解決された型情報を利用したい

path wildcardを利用したruntime middleware matchingでも一部は実現できる。

```ts
app.use('/me/*', bearerAuthentication)
```

しかし、この方式では「`/me/*`だから実行時にmiddlewareがmatchした」というruntime上の関係しか表現できない。

Loutreが必要としているのは、より強い構造上の保証である。

```text
rateLimit
└─ API Contract
   ├─ public
   └─ me
      └─ bearerAuthentication
         ├─ profile
         └─ settings
```

この構造から、`me.profile`と`me.settings`は必ず`bearerAuthentication`を通過し、Controllerでは認証によって提供されたContextを利用できる、と静的に導出できる必要がある。

また、LoutreではContractをfeatureごとに分割し、Application全体のContractへ再構成できることが望ましい。

```text
Contract Fragment N
        │
        ▼
Application Contract 1
        │
        ├─ Resolved Contract Node N
        │          │
        │          ▼
        │   Implementation N
        │          │
        │          ▼
        │       Module N
        │          │
        └──────────┴─────► Application 1
```

Contractは一度Application Contractへ集約され、そのtreeからImplementationが必要なnodeを選択する。

この構造により、Contractの分割可能性とApplication全体での横断的な保証を両立させる。

---

## Decision

Loutreは、HTTP Contractを再帰的なroute treeとしてcompositionできるようにする。

HTTP subtreeを表すための新しい`http.scope()`、`http.root()`、`http.group()`等のpublic primitiveは追加しない。

代わりに、`http()`自身がleaf routeとbranch routeの両方を表現できる再帰的なdefinitionを受け取る。

branchが持つ子routeのproperty名には`routes`を使用する。

`children`は採用しない。

Applicationのroot Contractも専用の`root` primitiveでは表現しない。

通常の`contract()`で構築されたContractを`defineApplication({ contract })`へ渡した時点で、そのContractがApplicationにおけるcomposition rootとなる。

Implementationは、元のfragment Contractではなく、Application Contract tree上で解決されたContract nodeへbindできることをcanonical modelとする。

既存の`contract.merge()`は削除する。feature Contractのcompositionは`routes`によるmountへ統一し、Contract object同士をprocedure名で構造mergeする別経路は持たない。

---

## 1. HTTP definitionを再帰的なtreeにする

HTTP nodeには2種類を持たせる。

```ts
type HttpNode = HttpRoute | HttpBranch
```

leaf routeは現在のHTTP procedureに相当する。

```ts
type HttpRoute = {
  method: HttpMethod
  path: string
  request?: HttpRequestDefinition
  responses: HttpResponses
  pipeline: HttpPipeline
}
```

branchは、descendant routeへ適用されるHTTP metadataとroute treeを持つ。

```ts
type HttpBranch = {
  path?: string
  pipeline?: HttpBranchPipeline
  responses?: HttpResponses
  routes: HttpRouteTree
}
```

`routes`はleafとbranchの両方を再帰的に保持できる。

```ts
type HttpRouteTree = {
  readonly [name: string]: HttpNode
}
```

`method`を持つnodeはleaf routeであり、`routes`を持つnodeはbranchである。

branch自身はdispatch対象にならない。

---

## 2. `children`ではなく`routes`を使用する

次のような分割Contractを考える。

```ts
const ApiContract = contract([
  http({
    greet: {
      method: 'GET',
      path: '/{name}',
      request: {
        params: {
          name: z.string().min(2),
        },
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({ message: z.string() }),
        },
      },
      pipeline: [validate.params, http.controller],
    },
  }),
])
```

このContractを`/api`配下へcompositionする場合、次の形をcanonicalとする。

```ts
const AppContract = contract([
  http({
    api: {
      path: '/api',
      routes: ApiContract.http,
    },
  }),
])
```

解決後のHTTP treeは次のようになる。

```text
AppContract.http
└─ api                    path: /api
   └─ greet               path: /{name}
      └─ GET /api/{name}
```

Contract nodeは次のように参照できる。

```ts
AppContract.http.api
AppContract.http.api.greet
```

`children`はgeneric tree implementationを連想させる一方、`routes`はHTTP domain上の意味が明確である。

また、`routes: ApiContract.http`とすることで、既存Contract側のroute名を繰り返し記述する必要がない。

部分的なcompositionやaliasが必要な場合のみobject formを利用する。

```ts
const AppContract = contract([
  http({
    api: {
      path: '/api',
      routes: {
        greet: ApiContract.http.greet,
      },
    },
  }),
])
```

---

## 3. Contract treeのkeyとHTTP pathを分離する

Contract tree上のkeyはApplication architecture上のnamespaceであり、URL segmentではない。

次の`api`は自動的に`/api`を意味しない。

```ts
http({
  api: {
    routes: ApiContract.http,
  },
})
```

URL prefixを与えたい場合は、HTTP protocol metadataとして明示する。

```ts
http({
  api: {
    path: '/api',
    routes: ApiContract.http,
  },
})
```

これにより、Contract topologyとwire-level identityを分離する。

同じContract treeをHTTP以外のProtocolへ展開する場合でも、Contract namespaceへHTTP routing semanticsを混入させない。

---

## 4. branch metadataはdescendantへ継承する

branchに指定された`path`、`pipeline`、`responses`はdescendant routeのeffective definitionへ継承される。

### Path

pathは親から子へ連結する。

```ts
const AppContract = contract([
  http({
    api: {
      path: '/api',
      routes: {
        greet: {
          method: 'GET',
          path: '/{name}',
          // ...
        },
      },
    },
  }),
])
```

effective route:

```text
GET /api/{name}
```

Contract treeのkeyはpathへ含めない。

### Pipeline

親pipelineは子pipelineを包む。

```ts
const AppContract = contract([
  http({
    api: {
      pipeline: [rateLimit],
      routes: {
        me: {
          pipeline: [bearerAuthentication],
          routes: MeContract.http,
        },
      },
    },
  }),
])
```

`AppContract.http.api.me.profile`のeffective executionは概念上次の形になる。

```text
rateLimit
└─ bearerAuthentication
   └─ route-local pipeline
      └─ http.controller
```

単純なruntime path matcherとしてmiddlewareを追加するのではなく、Contract treeからeffective pipelineを導出する。

親Layerのbefore/after semanticsを維持するため、内部表現は必要以上にflat化しない。

branchの`pipeline`にはterminalを配置しない。

`http.controller`等のterminalはleaf routeのpipelineにのみ配置する。

### Responses

branchはdescendant全体で共通となるresponse variantを宣言できる。

例えば認証Layerが`401`をshort circuitする場合、各leafへ同じresponseを繰り返さない。

```ts
const AppContract = contract([
  http({
    me: {
      pipeline: [bearerAuthentication],
      responses: {
        unauthorized: {
          status: 401,
          body: UnauthorizedBody,
        },
      },
      routes: MeContract.http,
    },
  }),
])
```

descendant leafのeffective responsesは、ancestor responsesとlocal responsesをmergeしたものになる。

同じvariant keyがancestorとdescendantで衝突する場合、暗黙overrideは行わずcompile errorとする。

override semanticsが必要になった場合は、別ADRで明示的なmechanismを設計する。

---

## 5. Contextの`requires` / `provides`をContract tree越しに伝播する

LoutreのLayerは単なるmiddleware functionではなく、Contextの`requires` / `provides`とshort circuitを型として持つ。

Contract branchのpipelineへLayerを置いた場合も、この情報をdescendant routeまで伝播させる。

例:

```text
session
  provides SESSION

bearerAuthentication
  requires SESSION
  provides CURRENT_USER

profile handler
  receives SESSION
  receives CURRENT_USER
```

Contract:

```ts
const AppContract = contract([
  http({
    me: {
      pipeline: [session, bearerAuthentication],
      routes: MeContract.http,
    },
  }),
])
```

`AppContract.http.me.profile`のController Contextでは、ancestor pipelineによって提供されたContextを型安全に利用できる。

```ts
ctx.session
ctx.currentUser
```

これはruntime middleware matcherの追加ではなく、rootからleafまでのContract topologyを型計算することで実現する。

---

## 6. Fragment ContractとResolved Contract Nodeを区別する

分割されたContract fragmentと、Application Contract tree上のnodeは同じ型情報を持つとは限らない。

例えば次のfragmentを定義する。

```ts
const ProfileContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/profile',
      responses: {
        ok: {
          status: 200,
          body: UserSchema,
        },
      },
      pipeline: [http.controller],
    },
  }),
])
```

fragment単体では、`bearerAuthentication`は存在しない。

一方、Application Contract上では認証済みsubtreeへ配置できる。

```ts
const AppContract = contract([
  http({
    me: {
      path: '/me',
      pipeline: [bearerAuthentication],
      responses: {
        unauthorized: {
          status: 401,
          body: UnauthorizedBody,
        },
      },
      routes: {
        profile: ProfileContract.http.get,
      },
    },
  }),
])
```

このとき、

```ts
ProfileContract.http.get
```

と

```ts
AppContract.http.me.profile
```

は異なる意味を持つ。

後者はrootからそのnodeまでのcompositionを解決した結果を持つ。

概念上:

```text
ProfileContract.http.get

GET /profile
pipeline:
  http.controller
```

に対して、

```text
AppContract.http.me.profile

GET /me/profile
pipeline:
  bearerAuthentication
  http.controller

responses:
  unauthorized: 401
  ok: 200
```

となる。

さらに`bearerAuthentication`が`CURRENT_USER`をprovideするなら、後者から導出したController Contextには`currentUser`が存在する。

---

## 7. ImplementationはResolved Contract Nodeへbindする

Implementationは、fragment ContractではなくApplication Contract tree上のresolved nodeを参照できることをcanonical modelとする。

```ts
const ProfileController = implementation({
  name: 'ProfileController',
  contract: AppContract.http.me.profile,
  protocol: http,

  factory: () => ({
    get(ctx) {
      ctx.currentUser
      // Userとして推論される
    },
  }),
})
```

これにより、Implementation側は「このhandlerは認証されているはず」という独自の型宣言を持たない。

認証、rate limit、session、tenant等の保証はContract treeから導出する。

```text
Contract topology
      │
      ▼
Effective pipeline
      │
      ▼
Resolved Context
      │
      ▼
Implementation handler type
```

Contractがserver implementationのsource of truthである方針を維持する。

### Implementation boundary

leaf nodeへのbindを最小primitiveとする。

subtree全体へのImplementation bindを許可するか、既存の複数procedure implementationとの互換性をどう扱うかは実装時に確定する。

ただし、どのgranularityを採用する場合でも、型推論元はfragmentではなくresolved Contract nodeとする。

---

## 8. Application Contractは専用primitiveにしない

`RootContract`という別のpublic型や`contract.root()`は追加しない。

通常のContractをApplication Definitionへ指定する。

```ts
export const AppContract = contract([
  http({
    // ...
  }),
])

export default defineApplication({
  contract: AppContract,
  modules: [ApiModule(), ProfileModule()],
})
```

この時点で`AppContract`がそのApplicationのcomposition rootとなる。

rootであることはContract自身の種類ではなく、Applicationにおける役割である。

これにより、同じContract subtreeをtest Applicationのrootとして利用することもできる。

```ts
defineApplication({
  contract: AppContract.http.me,
  modules: [ProfileModule()],
})
```

正確なsubtree Application APIは実装時に決定するが、専用のRoot Contract型へ依存しないことを原則とする。

---

## 9. Contractの全体構造

想定するApplication architectureは次の通り。

```text
Feature Contract ────────┐
Feature Contract ────────┤
Feature Contract ────────┤
                         ▼
                  Application Contract
                         │
                ┌────────┼────────┐
                ▼        ▼        ▼
           Resolved   Resolved   Resolved
             Node       Node       Node
                │        │        │
                ▼        ▼        ▼
        Implementation Implementation ...
                │        │
                └────┬───┘
                     ▼
                   Module
                     │
                     ▼
                 Application
```

概念上のcardinalityは次の通り。

```text
Contract Fragment N
      ↓
Application Contract 1
      ↓
Resolved Contract Node N
      ↓
Implementation N
      ↓
Module N
      ↓
Application 1
```

ownershipとしては、1つのModuleが複数Implementationを保持でき、1つのApplicationが複数Moduleを保持できる。

重要なのは、Contract群がApplication Contractへ一度集約され、そのtreeからImplementationへ型情報が再び広がることである。

---

## 10. Contract node identity

`AppContract.http.api.greet`へのproperty accessによって、毎回独立したContract objectをcloneしてはならない。

Contract treeは1つのcomposition identityを持ち、nodeはroot identityとnode pathで識別可能である必要がある。

概念上:

```text
Application Contract: contract:1

contract:1
└─ http
   └─ api
      └─ greet
```

node identity:

```text
contract:1 / http.api.greet
```

Graph Compiler、diagnostics、implementation coverage、execution root等は、このidentityを利用できる。

Public APIでは内部metadataをSymbol等へ隠し、利用者には自然なproperty accessだけを公開する。

```ts
AppContract.http.api.greet
```

`kind`、`children`、`definition`等のframework内部用propertyをpublic namespaceへ露出させない。

---

## 11. Graph validation

Application Graph compile時には、resolved Contract treeを基準に少なくとも以下を検証する。

### HTTP route collision

ancestor pathを解決した最終的な`method + path`で重複を検出する。

```text
GET /api/users
GET /api/users
```

は、異なるfragment由来であってもcollisionとする。

### Pipeline requirements

Layerの`requires`が、それより前のancestorまたはlocal pipelineで満たされていることを検証する。

### Short circuit responses

Layerが宣言するshort circuit responseが、effective responsesに存在することを検証する。

### Implementation coverage

Application Contractに存在する実装必須nodeについて、Implementationが存在することを検証する。

同一resolved nodeへの不正なduplicate implementationも拒否する。

### Module ownership

ImplementationはModuleへ所属し、ModuleはApplicationへ所属する。

Contract topologyとModule topologyは同一である必要はない。

Contractは外部surfaceとexecution contract、Moduleはimplementation dependency boundaryを表すため、両者を独立させる。

---

## 12. Global policyはApplication Contract全体を包むことで表現する

rate limit等を全HTTP routeへ漏れなく適用したい場合、path wildcardや別のApplication-level middleware APIはcanonical modelとしない。

Application Contractの最上位HTTP branchへpipelineを置く。

```ts
const AppContract = contract([
  http({
    api: {
      pipeline: [rateLimit],
      routes: {
        public: PublicContract.http,
        me: {
          pipeline: [bearerAuthentication],
          routes: MeContract.http,
        },
        health: HealthContract.http,
      },
    },
  }),
])
```

この構造に含まれるrouteはすべて`rateLimit`のdescendantである。

適用除外用の`skipMiddleware`相当をcanonical APIには追加しない。

例外routeが必要であれば、Contract topologyを分ける。

```text
AppContract
├─ unrestricted
└─ rateLimited
   ├─ users
   └─ me
```

これにより、「このsubtreeでは必ずpolicyが適用される」という構造上の保証を維持する。

---

## 13. Public API example

### Fragment Contract

```ts
export const ApiContract = contract([
  http({
    greet: {
      method: 'GET',
      path: '/{name}',
      request: {
        params: {
          name: z.string().min(2),
        },
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({
            message: z.string(),
          }),
        },
      },
      pipeline: [validate.params, http.controller],
    },
  }),
])
```

### Composition

```ts
export const AppContract = contract([
  http({
    api: {
      path: '/api',
      pipeline: [rateLimit],
      responses: {
        rateLimited: {
          status: 429,
          body: RateLimitedBody,
        },
      },
      routes: {
        greet: ApiContract.http.greet,

        me: {
          path: '/me',
          pipeline: [bearerAuthentication],
          responses: {
            unauthorized: {
              status: 401,
              body: UnauthorizedBody,
            },
          },
          routes: MeContract.http,
        },
      },
    },
  }),
])
```

Resolved tree:

```text
AppContract.http.api
│
├─ greet
│  └─ GET /api/{name}
│     pipeline:
│       rateLimit
│       validate.params
│       http.controller
│
└─ me
   │
   └─ bearerAuthentication
      ├─ profile
      │  └─ GET /api/me/profile
      └─ settings
         └─ GET /api/me/settings
```

### Implementation

```ts
export const GreetController = implementation({
  name: 'GreetController',
  contract: AppContract.http.api.greet,
  protocol: http,

  factory: () => ({
    greet(ctx) {
      return ctx.response.ok({
        body: {
          message: `Hello, ${ctx.request.params.name}!`,
        },
      })
    },
  }),
})
```

Authenticated route:

```ts
export const ProfileController = implementation({
  name: 'ProfileController',
  contract: AppContract.http.api.me.profile,
  protocol: http,

  factory: () => ({
    get(ctx) {
      return ctx.response.ok({
        body: ctx.currentUser,
      })
    },
  }),
})
```

`ctx.currentUser`の型は`ProfileContract`単体ではなく、`AppContract.http.api.me.profile`までのresolved pipelineから導出する。

---

## Rejected alternatives

### `contract.merge()`

採用しない。

feature Contractの再利用は`routes: FeatureContract.http`で表現する。`contract.merge()`はprocedure名を軸にContract objectを平坦化するため、Application上のmount位置、ancestor metadata、resolved node identityを表現できない。

```ts
const AppContract = contract([
  http({
    users: {
      routes: UsersContract.http,
    },
    admin: {
      path: '/admin',
      routes: AdminContract.http,
    },
  }),
])
```

Contract compositionの経路を`routes`へ一本化し、同じfeature Contractを異なる場所へmountした場合も別resolved nodeとして扱う。

### `http.scope()`

```ts
http.scope(
  {
    prefix: '/me',
    layers: [bearerAuthentication],
  },
  MeContract,
)
```

採用しない。

HTTP tree自身がbranchを表現できれば、scope専用primitiveは不要である。

`scope`を追加すると、route definitionとは別にcomposition DSLを理解する必要が生まれる。

### `http.root()`

採用しない。

rootはContractの種類ではなくApplication composition上の役割である。

`defineApplication({ contract })`へ渡されたContractがrootとなればよい。

### `http.group()`

採用しない。

branch routeが同じ責務を持てるため、別primitiveを追加する理由がない。

### `children`

```ts
api: {
  path: '/api',
  children: {
    greet: ApiContract.http.greet,
  },
}
```

採用しない。

generic tree用語であり、HTTP domainにおける内容を表しづらい。

`routes`をcanonical propertyとする。

### metadataと子nodeを同一object levelへ混在させる

```ts
api: {
  path: '/api',
  greet: ApiContract.http.greet,
}
```

採用しない。

`path`、`method`、`request`、`responses`、`pipeline`等のHTTP metadataとContract node名が同じnamespaceに入り、将来のproperty追加やroute名との衝突が発生する。

`routes`によってmetadata namespaceとroute namespaceを分離する。

### runtime wildcard middleware matchingをContract semanticsにする

```ts
app.use('/me/*', bearerAuthentication)
```

canonical modelにはしない。

routing pathの変更によってpolicy適用が意図せず外れる可能性があり、Contract Graphから型保証を導出しづらい。

runtime adapterが内部最適化としてmatcherを使用することまでは禁止しないが、Application semanticsのsource of truthにはしない。

### handler側で認証済みContextを再宣言する

採用しない。

Handlerが`CurrentUser`等を独自に`requires`として宣言するだけでは、実際にancestor pipelineで認証が保証されているかというContract topologyとの関係が弱くなる。

Controller Contextはresolved Contract pipelineから導出する。

---

## Consequences

### Positive

- `http.scope()`、`http.root()`、`http.group()`等の新しいcomposition primitiveを増やさずに済む
- HTTP Contract自体が自然なtreeになる
- Contractをfeature単位で分割し、Application Contractへ再構成できる
- `routes: ApiContract.http`で既存Contractをそのままmountできる
- path prefix、共通pipeline、共通responsesを構造的に継承できる
- `/me/*`が認証済みであることをpath conventionではなくContract topologyで保証できる
- ancestor LayerがprovideしたContextをController Handlerまで型伝播できる
- rate limit等の適用漏れをContract structureで防止できる
- Application ContractからImplementation coverageを検証できる
- Application Graph上でContract topologyを可視化できる
- ContractとModuleの責務を分離したまま保てる
- Contract-derived Typed Client / OpenAPIのsource of truthを維持できる

### Negative

- Contract型の再帰的な解決が複雑になる
- TypeScriptの型instantiation depthやcompile performanceへの影響を検証する必要がある
- fragment nodeとresolved nodeのidentityを区別する内部modelが必要になる
- 現在のContract object identityベースのGraph処理を見直す必要がある
- Implementation APIとprocedure partial implementationの既存semanticsを再設計する可能性がある
- responses merge、route collision、pipeline requirement等をresolution後に検証する必要がある

---

## Breaking change policy

本設計はContract、HTTP Protocol、Implementation、Application Graphの境界に影響するため、breaking changeとして実装してよい。

v0.xでは旧APIとの互換layerを恒久的に維持することより、canonical modelを単純にすることを優先する。

移行時には少なくとも以下を明示する。

- flat HTTP Contractからnested HTTP Contractへの移行
- ImplementationのContract参照方法
- Applicationへroot Contractを指定する方法
- partial implementation APIを変更する場合の移行
- inherited pipeline / responsesのbehavior

---

## Implementation order

実装は次の順で進める。

```text
1. HttpNode = Route | Branch の型modelを導入
2. `routes`を含むnested http() definitionを型付け
3. path / pipeline / responsesのresolutionを実装
4. resolved node identityを導入
5. Contract treeのproperty access surfaceを実装
6. requires / provides / short circuitの型伝播をnested routeへ拡張
7. Implementationをresolved Contract nodeへbind
8. Application DefinitionへContract rootを接続
9. Graph Compilerのcoverage / collision / identityを更新
10. OpenAPI / Typed Client / doctor / graphをresolved Contract treeへ対応
11. examplesとmigration documentationを更新
```

各段階でTypeScript compiler performanceを測定する。

特に深いContract tree、大量route、複数Layer継承を組み合わせたtype testを追加する。

---

## Open questions

本ADRでは方向性を決定するが、以下の細部は実装前に確定する。

### Implementationのgranularity

以下のどちらをcanonicalにするか。

```ts
contract: AppContract.http.api.greet
```

のようなleaf bindを唯一のprimitiveとするか、

```ts
contract: AppContract.http.api
```

のようなsubtree bindも許可するか。

型推論元をresolved nodeとする点は共通とする。

### `protocol`の明示

```ts
implementation({
  contract: AppContract.http.api.greet,
  protocol: http,
})
```

ではContract node自身がHTTPであることが明らかなため、将来的に`protocol`を推論可能にする余地がある。

ただし本ADRでは削除を決定しない。

### branch `responses`の型表現

ancestor response variantとdescendant response variantをmergeした型を、TypeScript compiler performanceを悪化させずに表現できるか検証する。

### Contract subtreeをtest Applicationのrootにできるか

Module / Integration TestでApplication全体のContractを必須importしなくて済むよう、resolved subtreeをtest Applicationのrootとして利用できる形を検討する。

### Same fragment multiple mounts

同一fragment Contractを複数箇所へcompositionした場合、それぞれを別resolved nodeとして扱う。

```ts
AppContract.http.public.profile
AppContract.http.admin.profile
```

同じfragment由来でもancestor pipelineが異なるため、Context型とnode identityは独立する。

この挙動をGraph IR、OpenAPI operation identity、Typed Client namingへどう反映するかは実装時に決定する。

---

## Summary

LoutreのHTTP compositionは、新しいscope primitiveを追加するのではなく、HTTP Contract自身を再帰的なroute treeへ拡張する。

canonical syntaxは次の形とする。

```ts
const AppContract = contract([
  http({
    api: {
      path: '/api',
      routes: ApiContract.http,
    },
  }),
])
```

`routes`によってHTTP metadataとdescendant routeを分離する。

parent branchの`path`、`pipeline`、`responses`はdescendantへ継承され、rootからleafまで解決したContract nodeがHandler Contextの型推論元となる。

ImplementationはApplication Contract上のresolved nodeを参照する。

```ts
implementation({
  contract: AppContract.http.api.greet,
  protocol: http,
  // ...
})
```

Application Contractは専用の`root`型ではない。

```ts
defineApplication({
  contract: AppContract,
  modules: [...],
})
```

とApplicationへ渡されたContractが、そのApplicationにおけるcomposition rootとなる。

このモデルにより、Loutreは次の流れを1つのContract topologyで表現する。

```text
Contract Fragment N
        ↓
Application Contract 1
        ↓
Resolved Contract Node N
        ↓
Implementation N
        ↓
Module N
        ↓
Application 1
```

Contractを一度Application全体へ集約し、その解決結果をImplementationへ再び広げることで、Contractの分割可能性、横断policy、typed Context、Application Graphを同じmodel上で成立させる。
