# Protocol-first Contract composition

## Status

Accepted

## Context

従来のContract DSLはprocedureを起点にprotocolを1件ずつぶら下げていた。

```ts
contract({
  create: procedure({
    protocols: {
      http: http({/* ... */}),
    },
  }),
})
```

この形はrouteが増えるほど`procedure -> protocols -> http`を繰り返す。GraphQL、WebSocket、SSEのようにprotocolごとに定義をまとめたい場合も、ファイル分割の境界とDSLの境界が一致しない。

またContractの`name`は、Graphの参照、diagnosticの表示、OpenAPIの`operationId`やschema component名まで兼任していた。これらは寿命も互換性要件も異なるため、Contract definitionのidentityとして扱わない。

## Decision

公開DSLをprotocol-firstへ変更する。

```ts
const UsersContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/users/{id}',
      responses: {/* ... */},
      pipeline: [http.controller],
    },
    create: {
      method: 'POST',
      path: '/users',
      responses: {/* ... */},
      pipeline: [http.controller],
    },
  }),
])
```

`http()`は複数procedureのHTTP定義を1つのprotocol groupとして返す。`contract()`はprotocol groupの配列を受け取り、procedure-firstのcanonical representationへ正規化する。

配列を採用するのは、Contractがprotocol groupのcollectionを合成するAPIであることをそのまま表現し、条件付きcompositionや事前に組み立てたgroup配列を自然に渡せるようにするため。protocol名はgroup自身が所有するため、`contract.http()`や`contract({ http: http(...) })`のような二重のprotocol identityは持たない。

単一のHTTP descriptorが必要なprotocol実装・低レベル検証では`http.route()`を使う。GraphQL / WebSocket / SSEの具体的なfactoryも各protocol実装が所有し、Coreは`ProtocolGroup` / `protocolGroup()`だけを提供する。

```text
Public DSL
http -> get
     -> create
graphql -> get
        -> create
websocket -> subscribe
sse -> subscribe

          ↓ normalize

Canonical Contract
get       -> http + graphql
create    -> http + graphql
subscribe -> websocket + sse
```

## Contract merge

分割単位をユーザーへ固定しないため`contract.merge()`を提供する。

```ts
const UsersContract = contract.merge([
  UsersHttpContract,
  UsersGraphqlContract,
  UsersEventsContract,
])
```

mergeはprocedure名を軸に異なるprotocolを統合する。同じ`procedure + protocol`を複数Contractが定義した場合は拒否し、異なるprocedure間でdispatch identityが衝突した場合も通常のContract定義と同じ重複検査を行う。

Contractの名前付けはmergeの責務ではないためoptionsは持たない。

## Identity ownership

`ContractDefinition`は構造だけを持つ。

```ts
interface ContractDefinition {
  readonly kind: 'contract'
  readonly procedures: Record<string, ProcedureDefinition>
}
```

同じ構造を持つContractを別々に生成した場合は別definitionであり、同じContract objectを複数箇所から参照した場合は同じdefinitionとして扱う。

Application Graphはcompile時にobject identityへopaque IDを割り当てる。

```text
contract:1
contract:2
implementation:1
implementation:2
```

Graph IRでは`ContractIR`がprocedure / protocol構造を持ち、Pipeline / Implementation / execution rootは`contract:N`を参照する。Implementationはopaque IDと人間向け`name`を分離し、`name`をGraph上のforeign keyにはしない。

Graph IDは1回のcompile結果の内部identityであり、永続化されたpublic identifierとして扱わない。

## Protocol and OpenAPI identity

protocol固有の外部identityはContract名ではなくprotocol自身が所有する。HTTPではmethod + pathから作られるdispatch keyがrouting identityになる。

OpenAPIの`operationId`はContract名から自動生成しない。デフォルトでは省略し、外部clientとの安定したidentifierが必要なApplicationだけがOpenAPI生成時に決める。

```ts
generateOpenApi(application, {
  info: { title: 'Users API', version: '1.0.0' },
  operationId: ({ method, procedure }) =>
    `${method.toLowerCase()}.${procedure}`,
})
```

schema component名もContract名へ依存せず、HTTP method / path / procedure / schema roleから生成する。Implementation名から`operationId`を作ることもしない。実装のrenameが外部APIのbreaking changeになるため。

HTTP clientやdiagnosticもContract名を要求せず、HTTPではmethod / path / procedure、Graphではopaque Contract IDを使って対象を示す。

## Breaking change

`procedure({ protocols: ... })`を公開Contract DSLから削除し、`ContractDefinition.name`とContract optionsも削除する。互換構文は保持しない。

移行前:

```ts
contract({
  get: procedure({
    protocols: {
      http: http({/* route */}),
    },
  }),
})
```

移行後:

```ts
contract([
  http({
    get: {/* route */},
  }),
])
```

Graph IRのContract / Implementation参照も表示名ベースからopaque IDベースへ変更する。

## Consequences

HTTP routeが増えてもprotocol名とnestが反復しない。protocolごとのファイル分割とContract DSLが一致し、同名procedureを複数protocolへprojectionできる。

Contractは純粋なdefinitionになり、Graph、Implementation、protocol、OpenAPIがそれぞれ必要な寿命のidentityを所有する。一方、Graph IDはcompileごとに採番されるため、外部システムが永続的に参照するidentifierには使えない。
