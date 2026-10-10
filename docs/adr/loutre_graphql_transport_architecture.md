# Loutre GraphQLトランスポート設計

ステータス: Accepted

## 背景

LoutreにGraphQLのQuery / Mutation / Subscriptionを追加する。

現状のLoutreではHTTP、WebSocket、Tasks、MessagePortがExecution Extensionとして分離されている。GraphQLはこれらと同列のトランスポートではなく、HTTP / WebSocket上で動作するアプリケーションプロトコルである。

GraphQL対応にあたり、次の課題を解消する必要がある。

- GraphQL over HTTPの仕様を既存HTTP Contractへ二重定義したくない
- WebSocket subprotocol `graphql-transport-ws` をnegotiationできない
- Node / Bun / Deno / Cloudflare WorkersでWebSocketをfirst-classにserveしたい
- 1本のsocket上で複数GraphQL operationをmultiplexできるようにしたい
- SubscriptionのAsyncIterable lifecycleとLoutreのdrain / tracingを整合させたい
- GraphQL固有のprotocol semanticsをDurable Objectやdomain event routerへ漏らしたくない

## 決定

GraphQLは新しいExecution Extensionにはしない。

`@loutrejs/graphql` を独立packageとして追加し、HTTP ExecutionとWebSocket Executionを合成するprotocol integrationとして実装する。

```text
GraphQL Endpoint
       │
       ├── HTTP Execution
       │      └── graphql-http
       │             └── graphql.execute()
       │
       └── WebSocket Execution
              └── graphql-ws
                     ├── graphql.execute()
                     └── graphql.subscribe()
```

実行時は標準の`GraphQLSchema`を使用し、Loutre独自のGraphQL Contract DSLは導入しない。共有する契約SDLから型付きresolverとclient型を生成する方針は[型生成とdomain mappingの設計](./loutre_graphql_codegen_architecture.md)に従う。

## package境界

新しいpublic packageを追加する。

```text
@loutrejs/graphql
├ peer: @loutrejs/loutre
├ peer: graphql
├ dependency: graphql-http
└ dependency: graphql-ws
```

GraphQL ecosystemはLoutre Coreとは独立したversion lifecycleを持つため、`@loutrejs/loutre/graphql` subpathではなく独立packageとする。

Package Distribution ADRのpublic package制限は、このpackage追加に合わせて更新する。

## Public API

基本APIは`graphql.endpoint()`とする。

Schemaとresolverの結合は[GraphQL Codegen ADR](loutre_graphql_codegen_architecture.md)のApplicationのbindManifestへ委譲する。

```ts
import { manifest } from './graphql/manifest.js'

const GraphQLApi = graphql.endpoint({
  name: 'GraphQLApi',
  path: '/graphql',
  manifest,
  transports: {
    http: true,
    websocket: {
      connectionInitWaitTimeout: 3_000,
    },
  },
  factory: (trips = inject(TripService)) => ({
    context({ request, signal }) {
      return {
        trips,
        request,
        signal,
      }
    },
  }),
})
```

`graphql.endpoint()`は内部でHTTP / WebSocket Executionを生成する。

## 複合Execution

GraphQL endpointは複数Executionを返すため、Coreへ汎用的なExecution groupを追加する。

```ts
export interface ExecutionGroup {
  readonly kind: 'execution-group'
  readonly name?: string
  readonly executions: readonly ExecutionDeclaration[]
}

export type ExecutionDeclaration = ExecutionDefinition | ExecutionGroup
```

Moduleの`executions`は`ExecutionDeclaration[]`を受け取り、Application Model compilerがcompile前にflattenする。

GraphQL固有のsemanticsはCoreへ入れない。

## HTTP raw protocol endpoint

GraphQL over HTTPは既存のresponse variant contractへ押し込まず、HTTP Extensionへprotocol integration向けのraw endpointを追加する。

```ts
http.raw({
  name: 'GraphQLApi.http',
  route: {
    method: '*',
    path: '/graphql',
    middlewares: [auth(), rateLimit()],
  },
  factory: () => async (ctx) => {
    return graphqlHandler(ctx.request)
  },
})
```

Raw endpointでも通常のHTTP routeと同じmiddleware、DI、routing、lifecycle、tracingを利用できる。

```text
Request
  ↓
Loutre route match
  ↓
middleware
  ├─ auth
  ├─ CORS
  ├─ rate limit
  └─ tracing
  ↓
raw handler
  ↓
graphql-http
  ↓
GraphQL execution
```

Raw handler contextはmiddleware stateも受け取る。

```ts
interface HttpRawExecutionContext<TState = unknown> {
  readonly request: Request
  readonly signal: AbortSignal
  readonly state: Readonly<TState>
}
```

Loutreが担当する範囲:

- route matching
- middleware
- middleware state
- DI
- ExecutionLease
- AbortSignal
- drain
- trace

integrationが担当する範囲:

- protocol body decode
- protocol validation
- response status selection
- Content-Type negotiation
- response serialization

Raw endpointのみ`method: '*'`を許可し、GraphQL HTTP handler自身へmethod validationを委譲する。

認証、CORS、rate limit、traceなどGraphQL handler到達前に適用したい処理は通常のLoutre middlewareとして挟めるようにする。

一方、GraphQL fieldやoperation内容に依存するauthorizationはresolver / execution context側で処理する。

## WebSocket handshake model

WebSocketはHTTP upgradeから開始するため、HTTP semantics自体は共有する。

ただしWebSocket ContractからHTTP Execution response contractの流用をやめる。

現在のような、

```ts
request?: Omit<HttpExecutionRequestDefinition, 'body'>
responses?: Readonly<Record<string, HttpExecutionResponseDefinition>>
```

という形は廃止する。

HTTP request headのportable primitiveだけを共通化する。

```ts
interface HttpRequestHeadDefinition {
  readonly params?: ...
  readonly query?: ...
  readonly headers?: ...
}

interface HttpExecutionRequestDefinition extends HttpRequestHeadDefinition {
  readonly body?: ...
}

interface WebSocketHandshakeDefinition extends HttpRequestHeadDefinition {
  readonly protocols?: readonly string[]
}
```

WebSocket routeは次の形にする。

```ts
interface WebSocketRouteDefinition {
  readonly path: string
  readonly handshake?: WebSocketHandshakeDefinition
  readonly messages?: WebSocketMessageCodec
}
```

つまり、

```text
HTTP primitives
      │
      ├── HTTP Execution
      │      └── body / responses
      │
      └── WebSocket handshake
             └── protocols / upgrade
```

とする。

WebSocket ContractからHTTP依存を消すのではなく、HTTP Execution Contractへの依存を除去する。

## WebSocket v2

WebSocket Extension ABIをv2へ上げる。

Driver APIを変更する。

```ts
export interface WebSocketUpgradeOptions {
  readonly protocol?: string
}

export interface WebSocketServerDriver {
  readonly runtime: string
  upgrade(
    request: Request,
    options: WebSocketUpgradeOptions,
  ): Promise<WebSocketUpgradeResult>
}

export interface WebSocketConnectionDriver {
  readonly protocol: string
  readonly messages: AsyncIterable<WebSocketDataMessage>
  readonly closed: Promise<WebSocketCloseInfo>

  send(message: WebSocketDataMessage): Promise<void>
  close(code?: number, reason?: string): Promise<void>
  terminate(): void | Promise<void>
}
```

GraphQL WebSocketでは`graphql-transport-ws`をsubprotocolとして選択する。

## WebSocket handler context

Handlerへopening request、protocol、session metadataを公開する。

```ts
interface WebSocketSession {
  readonly id: string
  readonly protocol: string
}

interface WebSocketHandlerContext {
  readonly request: Request
  readonly session: WebSocketSession
  readonly protocol: string
  readonly input: ...
  readonly signal: AbortSignal
  readonly closed: Promise<WebSocketCloseInfo>

  send(...): Promise<void>
  close(code?: number, reason?: string): Promise<void>
}
```

session idはWebSocket Extensionが生成するserver-side opaque IDとし、platform固有のsocket identifierには依存しない。

## Runtime adapterの再設計

Runtime adapterの「HTTP Extension必須」制約を撤廃する。

Node / Bun / Deno / Cloudflare WorkersはApplicationが必要とするHTTP / WebSocket capabilityに応じてserveする。

```text
HTTP only
WebSocket only
HTTP + WebSocket
```

Nodeではnative serverを共有し、

```text
node:http Server
   │
   ├── request
   │     └── app.http.fetch()
   │
   └── upgrade
         └── app.websocket.upgrade()
```

とする。

GraphQL packageはplatform固有コードを持たない。

## GraphQL over HTTP

HTTP側は`graphql-http`のFetch handlerを利用する。

GraphQL request parsing / validation / status / content negotiationをLoutre側で複製しない。

endpoint全体に対する認証等はLoutre HTTP middlewareで処理できる。

GraphQL field / operation内容に依存するauthorizationはGraphQL resolver / execution context側で処理する。

## GraphQL over WebSocket

WebSocket側は`graphql-ws`の`makeServer()`を利用する。

Loutre WebSocket contextを`graphql-ws`が要求するsocket interfaceへadapterする。

1 connection上で複数operationが同時実行されるため、message receive loopはoperation処理を逐次blockしない。

```ts
for await (const message of ctx.input.messages) {
  void onMessage(message)
}
```

active callback taskはsession終了時にcleanupする。

## Subscription lifecycle

Subscription executionはGraphQL.jsへ委譲する。

```text
Source Stream
      ↓
GraphQL.js createSourceEventStream()
      ↓
配送eventごとのData Resolution Scope
      ↓
GraphQL.jsによるeventの標準execution
      ↓
AsyncIterable<ExecutionResult>
      ↓
graphql-ws
      ↓
Client
```

GraphQL.js 16では`execute()`、17では`executeSubscriptionEvent()`を利用し、eventごとにScopeを破棄する。

Client `complete` またはsocket close時にはactive iteratorへ`return()`を伝播する。

WebSocket session close時には全active operationをcleanupする。

Application drain時は、

```text
stop accepting ingress
      ↓
close websocket 1001 Going Away
      ↓
graphql-ws cleanup
      ↓
subscription iterator.return()
      ↓
wait
      ↓
timeout
      ↓
terminate()
```

とする。

## AbortSignal

HTTPでは`request.signal`を利用する。

WebSocketではoperationごとにAbortControllerを作る。

```text
socket close
  ├─ abort operation A
  ├─ abort operation B
  └─ abort operation C

client complete(id)
  └─ abort operation id
```

AsyncIterator.return()とAbortSignalの両方をcleanup mechanismとして使う。

## GraphQL operation tracing

WebSocket connection全体は1つの`websocket.session` Executionとしてtraceする。

GraphQL operationはそのsession配下のsub-operationとしてtraceする。

既存Coreの`beginOperation()`を利用できるよう、WebSocket handler contextへ汎用的なexecution instrumentation viewを公開する。

```ts
interface ExecutionContextView {
  readonly signal: AbortSignal

  annotate(attributes: Readonly<Record<string, unknown>>): void

  beginOperation(metadata: RuntimeOperationMetadata): ExecutionOperationLease
}
```

GraphQL operation traceには最低限次を付与する。

```text
websocket.session.id
websocket.protocol

graphql.session.id
graphql.operation.id
graphql.operation.name
graphql.operation.type
graphql.transport
```

`graphql.operation.id`はclient-provided IDなのでglobal uniqueとはみなさない。

```text
graphql.session.id + graphql.operation.id
```

をconnection内operationのcorrelation keyとする。

Devtoolsでは概念上、

```text
WebSocket Session [ws_01K...]
├ Subscription TripUpdates [id: 1]
├ Query CurrentStatus [id: 2]
└ Subscription Alerts [id: 3]
```

のように表示できる。

Subscription eventごとに新しいExecutionLeaseは作らない。

1 Subscription lifetime全体を1 operationとし、必要なら`eventCount`等をannotationする。

GraphQL responseの`errors`は必ずしもruntime failureではないため、それだけで`lease.fail()`は呼ばない。

## 分散Subscription構成

GraphQL protocol semanticsはGraphQL integration / Worker側に留める。

```text
GTFS-RT VPS
      │
      ▼
Durable Object / Event Router
      │
      │ domain event
      ▼
GraphQL Subscription Resolver
      │
      ▼
GraphQL selection execution
      │
      ▼
graphql-ws
      │
      ▼
Client
```

Durable Objectやevent routerへGraphQL document、selection set、`graphql-transport-ws` messageを持ち込まない。

下流はdomain event infrastructureとしてGraphQL非依存を維持する。

## OpenAPI / tooling

GraphQL raw endpointは通常HTTP schemaとしてOpenAPIへ展開しない。

Graph projectionにはprotocol endpointとして最低限のmetadataだけを出す。

GraphQL schema toolingにはGraphQL introspection / SDLを使う。

Application Modelへlive `GraphQLSchema` 全体をserializeしない。

## 破壊的変更

0.8.0では次をbreaking changeとして許容する。

```diff
-WebSocketRouteDefinition.request
-WebSocketRouteDefinition.responses
+WebSocketRouteDefinition.handshake

-WebSocketServerDriver.upgrade(request)
+WebSocketServerDriver.upgrade(request, options)

+WebSocketConnectionDriver.protocol
+WebSocketHandlerContext.request
+WebSocketHandlerContext.session

+http.raw()
+method: '*' for raw endpoint

+ExecutionGroup
+ExecutionDeclaration

-Runtime requires HTTP Extension
+Runtime serves required HTTP/WebSocket capabilities

+@loutrejs/graphql
```

## 実装順序

1. WebSocket v2 + subprotocol negotiation
2. Node / Bun / Deno / Cloudflare Workers WebSocket runtime
3. HTTP raw endpoint + middleware state
4. Composite Execution
5. `@loutrejs/graphql` HTTP Query / Mutation対応
6. GraphQL WebSocket + Subscription対応
7. operation tracing / session correlation
8. conformance test

## PR分割案

```text
PR 1
WebSocket Execution v2 + subprotocol

PR 2
Node / Bun / Deno / Cloudflare Workers WebSocket runtime

PR 3
HTTP raw protocol endpoint + ExecutionGroup

PR 4
@loutrejs/graphql HTTP support

PR 5
GraphQL WebSocket + Subscription

PR 6
GraphQL operation tracing + conformance
```

## 完了条件

次を満たした時点でGraphQL transport対応の初期実装を完了とする。

- Query / MutationをGraphQL over HTTPで実行できる
- Query / Mutation / SubscriptionをGraphQL over WebSocketで実行できる
- `graphql-transport-ws` subprotocolを正しくnegotiationできる
- Raw endpointで通常のLoutre middlewareとmiddleware stateを利用できる
- Node / Bun / Deno / Cloudflare Workersで対応runtimeを提供できる
- WebSocket session IDとGraphQL operation IDをtrace上でcorrelationできる
- Subscription停止時にiterator cleanupとAbortSignal propagationが行われる
- Application drain時にactive Subscriptionがgracefulに終了する
- GraphQL protocol semanticsがDurable Object / event routerへ漏れない
- runtime / protocol conformance testが通る

## 結果

この設計によりGraphQL対応のためだけのprotocol-specific logicをCoreへ追加せず、HTTP / WebSocket transport自体をより再利用可能な形へ整理できる。

特に、

- raw HTTP integration
- WebSocket subprotocol negotiation
- request-head primitive共有
- WebSocket session identity
- HTTP非必須runtime
- operation-level instrumentation

はGraphQL以外のprotocol integrationでも再利用できる。
