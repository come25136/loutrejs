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

この形は1つのHTTP Contractにrouteが増えるほど`procedure -> protocols -> http`を繰り返す。さらにGraphQL、WebSocket、SSEのようにprotocolごとに定義をまとめたい場合、ファイル分割の境界とDSLの境界が一致しない。

ContractはServer / Client / Toolingのsource of truthであるため、特定protocolの記述量がApplication model全体を冗長にする構造は避ける。

## Decision

公開DSLをprotocol-firstへ変更し、Contract builderは各protocolが所有する。

```ts
const UsersHttpContract = http.contract({
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
})
```

`http.contract()`は複数procedureのHTTP定義を1つのContractとして返す。単一のHTTP descriptorが必要なprotocol実装・低レベル検証では`http.route()`を使う。`http`自体はcallableにせず、Contract作成とroute descriptor作成の意味をAPI上で分離する。

GraphQL / WebSocket / SSEも同じ規則で`graphql.contract()` / `websocket.contract()` / `sse.contract()`を所有する。Coreの`contract` namespaceはprotocol固有DSLを持たず、Contract同士のcompositionだけを所有する。

```text
http.contract       -> get + create
graphql.contract    -> get + create
websocket.contract  -> subscribe
sse.contract        -> subscribe

          ↓ contract.merge

Canonical Contract
get       -> http + graphql
create    -> http + graphql
subscribe -> websocket + sse
```

Coreはprotocol固有の構造を知らない。`ProtocolGroup`と`defineProtocolContract()`をprotocol実装向けの拡張点として提供し、各protocolのbuilderが従来からRuntime / Graphが利用しているprocedure-firstのcanonical representationへ正規化する。protocol追加のたびにCoreの`contract` namespaceへpropertyを登録しない。

## Contract merge

分割単位をユーザーへ固定しないため`contract.merge()`を提供する。

```ts
const UsersContract = contract.merge(
  UsersHttpContract,
  UsersGraphqlContract,
  UsersEventsContract,
  { name: 'UsersContract' },
)
```

mergeはprocedure名を軸に異なるprotocolを統合する。最後のoptionsで、統合後のContract名も指定できる。同じ`procedure + protocol`を複数Contractが定義した場合は曖昧なので拒否する。異なるprocedure間でdispatch identityが衝突した場合も、通常のContract定義と同じ重複検査を行う。

これにより次のどちらも同じcanonical Contractになる。

- 1ファイルで複数protocolをまとめて定義する
- protocol / feature / bounded context単位でContractを分割し、最後にmergeする

## Breaking change

`procedure({ protocols: ... })`、`contract({ http: http(...) })`、`contract(http(...))`を公開Contract DSLから削除する。互換用の旧構文は保持しない。

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
http.contract({
  get: {/* route */},
})
```

複数protocolを1つのContractへまとめる場合だけ`contract.merge()`を使う。

## Consequences

HTTP routeが増えてもprotocol名とnestが反復しない。protocolごとのファイル分割とContract DSLが一致し、同名procedureを複数protocolへprojectionできる。

一方、Runtime / Graph / Implementationは引き続きprocedure-first canonical Contractを扱う。protocol-firstはauthoring surfaceであり、execution modelをprotocol中心へ変更しない。
