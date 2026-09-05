# Loutre WebSocket Protocol Architecture

Status: **Proposed / Design Frozen**

Date: 2026-09-05 JST

対象: Loutre v0 breaking change

実装担当向け注意:

- 本ADRはWebSocket Protocol実装のSource of Truthとする。
- 後方互換性よりApplication Graph / Pipeline /型推論との整合性を優先する。
- 本ADRにないmessage routing、subprotocol、custom codec等を実装時に追加しない。
- WebSocket固有の例外をCoreへ増やすより、既存のProtocol / Pipeline抽象を一般化する。
- Runtime差はadapterへ閉じ込め、Application authorへnative WebSocket objectを公開しない。

---

## 1. Decision summary

LoutreへWebSocketをfirst-class Protocolとして追加する。

WebSocketのApplication Graph上の基本単位はmessageではなくconnection / sessionとする。

```text
1 Procedure
=
1 WebSocket connection / session
=
1 Application execution
```

公開DSLの基本形は次とする。

```ts
const AppContract = contract([
  websocket({
    realtime: {
      path: '/realtime',
      responses: {
        unauthorized: {
          status: 401,
          body: Unauthorized,
        },
      },
      pipeline: [authentication],
      routes: {
        chat: {
          path: '/rooms/{roomId}/chat',
          request: {
            params: {
              roomId: z.string(),
            },
          },
          messages: websocket.json({
            input: ClientMessage,
            output: ServerMessage,
          }),
          pipeline: [http.validate.params, websocket.handler],
        },
      },
    },
  }),
])
```

Implementation handlerはconnection lifetime全体を扱う。

```ts
async chat(ctx) {
  const roomId = ctx.input.params.roomId
  const user = ctx.state.auth.currentUser

  for await (const message of ctx.input.messages) {
    if (!message.isValid) continue

    await ctx.send({
      type: 'received',
      message: message.value,
    })
  }
}
```

WebSocket Protocolは内部的に常に`interaction: 'duplex'`とし、Application authorには指定させない。

---

## 2. Procedure boundary

### 2.1 messageをProcedureにしない

WebSocket自身が提供するsemanticはconnection、text / binary data message、Close等であり、`join`、`message`、`leave`等のevent nameはApplication protocolである。

そのため次のようなmessage routingをLoutre CoreのProcedure modelにはしない。

```text
connection
 ├ join       -> Procedure
 ├ message    -> Procedure
 └ leave      -> Procedure
```

v1ではApplicationがschema unionを使ってmessageを分岐する。

```ts
const ClientMessage = z.discriminatedUnion('type', [JoinMessage, ChatMessage])

for await (const message of ctx.input.messages) {
  if (!message.isValid) continue

  switch (message.value.type) {
    case 'join':
      break
    case 'message':
      break
  }
}
```

message-level Procedure、message router、per-message PipelineはNon-goalとする。

### 2.2 connectionは1 execution

WebSocket connectionのOPENからCLOSEDまでを1 Application executionとして数える。

```text
ApplicationRuntime.execute()
        │
        ▼
HTTP Upgrade phase
        │
        ▼
WebSocket OPEN
        │
        ▼
handler / session
        │
        ▼
CLOSED
        │
        ▼
execution ends
```

これにより既存のactive execution / shutdown semanticsと接続寿命を一致させる。

WebSocket専用DI scopeは導入しない。将来execution scopeを導入する場合、HTTPでは1 request、WebSocketでは1 connectionへ自然に対応できる。

---

## 3. HTTP entry phase and `entryProtocol`

### 3.1 WebSocket executionはHTTPから入る

WebSocket opening handshakeはHTTPとして扱う。

```text
HTTP Upgrade Request
        │
        ├ params
        ├ query
        ├ headers
        ├ validation
        ├ authentication / authorization
        │
        ▼
 websocket.handler
 ───── commit point ─────
        │
        ▼
 WebSocket session
```

WebSocket固有の「handshake context」は作らない。

`path`、`request.params`、`request.query`、`request.headers`、Upgrade前のshort-circuit responseはHTTP phaseの概念とする。

### 3.2 `ProtocolDescriptor.entryProtocol`

Protocol自身のsemanticとterminal到達前のingress semanticを分離するため、Coreへ`entryProtocol`を追加する。

概念形:

```ts
interface ProtocolDescriptor<...> {
  readonly protocol: string
  readonly entryProtocol?: string
  // ...
}
```

省略時は`protocol`自身をentry protocolとする。

```text
HTTP
protocol      = http
entryProtocol = http

MessagePort
protocol      = messagePort
entryProtocol = messagePort

WebSocket
protocol      = websocket
entryProtocol = http
```

`entryProtocol`はdirect edgeのみを表し、transitive relationを1 fieldで表現しない。

将来GraphQL等が別Protocol上にhostされる場合も同じ関係を使用できる。

```text
HTTP -> WebSocket -> GraphQL
```

ここでGraphQL-over-WebSocketならGraphQLの直接の`entryProtocol`は`websocket`であり、`http`ではない。

`entryProtocol`はcapability inheritanceを意味しない。

```text
protocol       = Application semantics
entryProtocol  = pre-terminal ingress semantics
capabilities   = Runtime requirements
```

---

## 4. `websocket.handler` is the commit point

WebSocket leafはterminalとして`websocket.handler`を明示しなければならない。

```ts
pipeline: [http.validate.headers, authentication, websocket.handler]
```

暗黙terminalは追加しない。

理由:

- HTTP phaseとWebSocket phaseの境界をContract source上に表す。
- 既存`http.controller` / `messagePort.handler`とterminal modelを統一する。
- Pipeline validationでterminalの欠落、重複、terminal後Layerを検出できる。
- around Layerの`await next()`がsession lifetime全体を囲むことを明示できる。

```text
tracing before
    ↓
websocket.handler
    ↓
Upgrade
    ↓
session
    ↓
CLOSED
    ↓
tracing after
```

branch pipelineにはterminalを置けない。

---

## 5. Request and response model

### 5.1 Request

WebSocket leafはUpgrade requestのApplication inputを宣言できる。

```ts
request: {
  params?: HttpParamsSchemas
  query?: StandardSchemaV1
  headers?: StandardSchemaV1
}
```

v1ではrequest bodyをWebSocket opening requestのpublic Contractへ含めない。

`http.validate.params` / `http.validate.query` / `http.validate.headers`をWebSocket Pipelineでもそのまま使用する。

WebSocket専用の`websocket.validate.*`は作らない。

WebSocket成立に必要な`Upgrade`、`Connection`、`Sec-WebSocket-Key`、`Sec-WebSocket-Version`等のprotocol mechanicsはframework / Runtimeが検査する。Application authorへschema宣言を要求しない。

### 5.2 Responses

WebSocket leaf / branchの`responses`はUpgrade前に返せる`entryProtocol` responseであり、WebSocket data messageではない。

```ts
responses: {
  unauthorized: {
    status: 401,
    body: Unauthorized,
  },
}
```

型・Runtime representationはHTTP response definitionを再利用する。

handler contextに`ctx.response`は公開しない。Upgrade commit後にHTTP responseへ戻ることはできない。

Framework自身が返すmalformed handshakeやschema validationの4xxをApplication Contractへ毎回宣言させる必要はない。`responses`は主にLayerのdeclared short-circuitを検査するためのContract surfaceとする。

---

## 6. HTTP Layer reuse and short-circuit

`basicAuth` / `bearerAuth`等のHTTP LayerをWebSocket専用APIへ複製しない。

既存Layerのshort-circuit declaration:

```text
protocol = http
response = unauthorized
```

は、WebSocket targetの`entryProtocol = http`に対して合法とする。

Graph / type validationはtarget protocolそのものではなく、pre-terminal short-circuitについてtargetのentry protocolを使用する。

```text
WebSocket Procedure
 protocol      = websocket
 entryProtocol = http
        │
        └ basicAuth shortCircuit(protocol=http)
             └ HTTP 401 before Upgrade
```

short-circuit response variant、body、headers、status metadataはWebSocket definitionのeffective `responses`と照合する。

既存Pipeline runtimeは`await next()`後のshort-circuitを禁止しているため、HTTP short-circuitがUpgrade commit後に返されることはない。

---

## 7. Route tree

WebSocketはHTTPと同じnested route tree semanticsを持つ。

branch:

```ts
interface WebSocketBranchDefinition {
  readonly path?: string
  readonly pipeline?: readonly PipelineItem[]
  readonly responses?: Readonly<Record<string, HttpResponseDefinition>>
  readonly routes: WebSocketRouteTree
}
```

leaf:

```ts
interface WebSocketProtocolDefinition {
  readonly path: string
  readonly request?: WebSocketRequestDefinition
  readonly responses?: Readonly<Record<string, HttpResponseDefinition>>
  readonly messages?: WebSocketMessageDefinition
  readonly pipeline: readonly PipelineItem[]
}
```

branchから継承するのは次のみ。

```text
path
pipeline
responses
```

`request`と`messages`はleaf固有とし、schema mergeは行わない。`responses`はpublic leaf / branchの双方でoptionalとし、継承解決後のeffective response setは未指定時`{}`とする。

parent pathに含まれるpath paramはeffective pathへ含まれるため、leaf handlerから利用できる。

```ts
websocket({
  rooms: {
    path: '/rooms/{roomId}',
    routes: {
      chat: {
        path: '/chat',
        pipeline: [websocket.handler],
      },
    },
  },
})
```

上記のeffective pathは`/rooms/{roomId}/chat`となる。

procedure namespaceもHTTP nested Contractと同じくresolved route treeから構築する。

---

## 8. Dispatch semantics

WebSocket dispatch keyはmethodを含めず、normalized pathから生成する。

```text
websocket:/chat
websocket:/rooms/{}/chat
```

HTTP dispatch keyとはprotocol prefixが異なるため、同じpathを共存可能とする。

```text
http:GET:/chat
websocket:/chat
```

同一normalized pathのWebSocket leaf同士はduplicate dispatchとして拒否する。

RuntimeではWebSocket upgrade intentをtransport selectorとする。

```text
incoming request
      │
      ├ WebSocket upgrade intent -> WebSocket execution
      │
      └ otherwise                -> HTTP execution
```

WebSocket intentを検出した後にHTTP routeへfallbackしない。

- WebSocket intent + WS routeなし: 404
- WS route match + malformed opening handshake: Upgrade前の4xx
- Upgrade intentなし + HTTP routeなし: 通常のHTTP 404
- WebSocket-only pathへ普通のGET: 426等へ特別変換せずHTTP 404

---

## 9. Message codec DSL

v1のbuilt-in codecは次の3つとする。

```ts
websocket.json({ input?, output? })
websocket.text({ input?, output? })
websocket.binary({ input?, output? })
```

`input` / `output`は少なくとも片方必須とする。

`messages`自体はoptionalとする。

```text
messages omitted
  -> Application data message APIなし

json/text/binary({ input })
  -> receive-only

json/text/binary({ output })
  -> send-only

json/text/binary({ input, output })
  -> bidirectional
```

### 9.1 Frameをpublic abstractionにしない

Runtime adapterはWebSocket fragmentationを再構築し、Loutre Protocolにはcomplete data messageを渡す。

内部境界は概念的に次の形とする。

```ts
type WebSocketDataMessage =
  | { readonly type: 'text'; readonly data: string }
  | { readonly type: 'binary'; readonly data: Uint8Array }
```

frame API、fragment APIは公開しない。

### 9.2 JSON

`websocket.json()`はtext WebSocket messageへJSON representationを載せる。

受信:

```text
text message
 -> JSON.parse
 -> input schema validation
```

送信:

```text
output schema validation
 -> JSON.stringify
 -> text message
```

binary messageを暗黙にUTF-8 decodeしない。JSON codecへbinary messageが届いた場合はdecode failureとする。

### 9.3 Text

`websocket.text()`のwire valueは`string`とする。

schema transformは許可するが、送信時の最終SchemaOutputはstringでなければならない。

### 9.4 Binary

`websocket.binary()`のwire valueはRuntime差を吸収して`Uint8Array`へ正規化する。

送信時の最終SchemaOutputは`Uint8Array`でなければならない。

### 9.5 Non-goals

v1では次を公開しない。

```text
custom codec
raw mixed text/binary codec
subprotocol negotiation DSL
message routing DSL
```

具体的なユースケースが発生してから追加する。

---

## 10. Incoming validation

受信messageのdecode / schema validation failureでLoutreはconnectionを自動closeしない。

Applicationへdiscriminated resultとして渡す。

```ts
type WebSocketIncomingMessage<T> =
  | {
      readonly isValid: true
      readonly value: T
    }
  | {
      readonly isValid: false
      readonly raw: unknown
      readonly error: SchemaValidationError | WebSocketMessageDecodeError
    }
```

`valid`ではなく状態を表す`isValid`を使用する。

### 10.1 Schema validation failure

既存Coreの`SchemaValidationError`を再利用する。WebSocket専用validation errorは作らない。

`raw`はschemaへ渡したdecode後valueを保持する。

### 10.2 Decode failure

wire representationをcodec valueへ変換できない場合のみ`WebSocketMessageDecodeError`とする。

JSON parse failureやJSON codecへのbinary message等を含む。

`raw`には元のtext / binary dataを保持できる。

### 10.3 Application policy

invalid messageを無視する、error messageを送る、`ctx.close(1007)`する等はApplicationが決める。

```ts
for await (const message of ctx.input.messages) {
  if (!message.isValid) {
    await ctx.close(1007)
    return
  }
}
```

---

## 11. Handler context

HTTP phase Layer contextとWebSocket handler contextはpublic typeとして分離する。

HTTP phase Layerが利用できる概念:

```text
ctx.input.params
ctx.input.query
ctx.input.headers
ctx.state
ctx.logger
ctx.signal
```

`websocket.handler`到達後のterminal handlerは上記を引き継ぎ、Contractに応じてsession APIが追加される。

```text
ctx.input.messages   inputを宣言した場合のみ
ctx.send()           outputを宣言した場合のみ
ctx.close()
ctx.closed
```

Contractに宣言していない能力はContextから型レベルで消す。

```ts
messages: websocket.json({ output: Notification })
```

の場合:

```ts
ctx.input.messages // type error
await ctx.send(notification) // valid
```

通常Layerへ`send` / `close` / `closed`を公開しない。

Runtime内部で同一context stateを共有しても、public typeとしてphaseを混在させない。

### 11.1 HTTP input type refinement

既存HTTPと同じ`HasValidationBeforeTerminal` semanticsを使う。

validation Layerがterminalより前に存在しない場合はraw input、存在する場合はSchemaOutputをhandlerへ見せる。

```text
schema declaration
+
validation layer before terminal
=
validated handler input
```

`StateProvidedBeforeTerminal`もそのまま利用し、pre-terminal Layerが提供したstateをconnection lifetime中保持する。

---

## 12. `ctx.send()`

公開API:

```ts
send(value: Output): Promise<void>
```

Promise resolveはclient applicationが受領・処理したことを意味しない。

Loutre / Runtimeがtransport backpressureを尊重し、安全に次のsendへ進める状態になったことを意味する。

Application-level acknowledgementが必要ならApplication protocolでack messageを定義する。

### 12.1 Validation and encoding

送信順序:

```text
output schema validation
 -> codec encode
 -> transport send / backpressure
```

output schema違反は既存`SchemaValidationError`としてrejectする。

codec encoding failureは`WebSocketMessageEncodeError`としてrejectする。

CLOSING / CLOSED connectionへのsendは`WebSocketConnectionNotOpenError`としてrejectする。

### 12.2 Ordering

同一connection上では`ctx.send()`のinvoke orderをwire send orderとして保証する。

```ts
const a = ctx.send({ n: 1 })
const b = ctx.send({ n: 2 })
const c = ctx.send({ n: 3 })

await Promise.all([a, b, c])
```

wire orderは必ず`1 -> 2 -> 3`とする。

validation -> encoding -> transport/backpressureを含むsend pipeline全体をconnection単位でserializeし、async validation等で順序が逆転しないようにする。

validation / encoding failureはconnection自体がhealthyならそのsendだけをrejectし、後続queue全体を破棄しない。

transport failure時はpending / subsequent sendをconnection unavailableとしてrejectする。

### 12.3 Un-awaited send

大量の`void ctx.send()`をframework独自queue limitで禁止しない。

intentional fire-and-forgetはApplication authorの責任とし、create-loutre template側で`@typescript-eslint/no-floating-promises`相当のlintを推奨する。

`trySend` / `sendNow` / custom admission APIはv1へ追加しない。

---

## 13. Close lifecycle

公開API:

```ts
close(code?: number, reason?: string): Promise<void>
readonly closed: Promise<WebSocketCloseInfo>
readonly signal: AbortSignal
```

### 13.1 `ctx.close()`

`ctx.close()`はgraceful closeを開始し、connectionが実際にCLOSEDへ到達するまでresolveしない。

```ts
await ctx.close(1000, 'bye')

// connection is CLOSED
// ctx.signal.aborted === true
// ctx.closed is already resolved
```

state transition:

```text
OPEN
 │ ctx.close()
 ▼
CLOSING
 │
 ├ pre-close queued sends
 ├ Close frame
 ├ closing handshake / runtime fallback
 ▼
CLOSED
 │
 ├ ctx.closed resolves
 ├ ctx.signal aborts
 └ ctx.close() resolves
```

`ctx.close()`をinvokeした時点でApplication-visible stateをCLOSINGとし、その後の`ctx.send()`を拒否する。

local closeはclose invokeより前にinvokeされたsendの順序を尊重する。

`ctx.close()`はidempotentとし、複数close requestでは最初に開始されたcloseを優先する。

connectionが途中でnetwork failure等によりCLOSEDへ到達した場合も、CLOSED到達自体では`ctx.close()`をrejectしない。clean / abnormalの情報は`ctx.closed`で確認する。

invalid close code / reason等のAPI引数違反はrejectしてよい。

### 13.2 `ctx.closed`

`ctx.closed`は自分からcloseを開始せず、peer、Application、shutdown、transport failure等の理由を問わずconnectionがCLOSEDになるのを待つ。

```ts
interface WebSocketCloseInfo {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
}
```

`ctx.closed`はtransport terminationを理由にrejectせず、常にclose infoとしてresolveする。

Close frameのない異常終了は概念的に`code: 1006`, `wasClean: false`へ正規化する。

### 13.3 Remote Close

peerからCloseを受け取った場合:

```text
OPEN
 -> CLOSING
 -> new inbound delivery停止
 -> queued outbound data sendをcancel
 -> Close reply
 -> CLOSED
```

local closeと異なり、peerがcloseを要求した後に任意のqueued dataを全flushしない。

### 13.4 Incoming iterator termination

`ctx.input.messages`はnormal / abnormalを問わずconnection termination時に正常終了する。

transport failureをiterator throwとしてApplication exceptionへ混ぜない。

```ts
for await (const message of ctx.input.messages) {
  // ...
}

const close = await ctx.closed
if (!close.wasClean) {
  // abnormal transport termination
}
```

---

## 14. Handler completion and failure

handlerがconnection OPEN中にreturnした場合、Applicationがsession処理を完了したものとしてLoutreがnormal close 1000を開始する。

```ts
async chat(ctx) {
  await ctx.send({ type: 'hello' })
  // return -> normal close 1000
}
```

handlerがuncaught exceptionをthrowし、connectionがまだOPENなら:

```text
log error
 -> Close 1011
 -> CLOSEDまで待つ
```

sensitiveなexception detailをClose reasonへ自動公開しない。

既にCLOSINGの場合は既存close reasonを上書きしない。

incoming validation failureはhandler exceptionではなく`isValid: false` valueであるため、この1011 pathへ入らない。

---

## 15. Upgrade commit and Runtime driver boundary

Application authorへ`ctx.accept()` / `ctx.upgrade()`を公開しない。

`websocket.handler` terminalへ到達すること自体がUpgrade acceptの意思決定となる。

```text
pre-terminal Layer
   │
   ├ short-circuit -> HTTP response
   │
   └ next
       ↓
websocket.handler
       ↓
Runtime upgrade commit
       ↓
OPEN
```

native Upgrade APIはRuntimeごとに異なるため、WebSocket Protocol executionはnormalized Runtime driverを使用する。

Bun / Deno / Cloudflare Workers / Node等のnative objectはProtocol public APIへ漏らさない。

### 15.1 Handshake completionとsession lifetimeを分離

Upgrade responseをRuntimeへ返すためのcompletionと、Pipeline / Application executionがconnection CLOSEDまで生存するlifetimeを内部的に分離する。

```text
executePipeline
    │
websocket.handler
    │
    ├ Upgrade commit completion -> native hostへ即返却
    │
    └ session lifetime
          ↓
        CLOSED
          ↓
      Pipeline unwind
```

Deno / Cloudflare Workers等でconnection終了まで101 response返却を待たせてはならない。

BunのようにUpgrade commit時点でnative WebSocket objectがまだ得られないRuntimeはadapter内部bridgeで吸収する。

Nodeのように通常HTTP callbackとupgrade eventが分かれるRuntimeもadapterで同じsemanticへ正規化する。

### 15.2 Upgrade failure

Upgrade commit前のnative failureはHTTP phaseのfailureとして扱い、handlerを開始しない。

予期しないRuntime failureは5xx、malformed opening handshakeは4xxとしてUpgrade前に終了できる。

Upgrade commit後はHTTP responseへ戻れないため、session lifecycleのerror handlingへ移行する。

---

## 16. `ctx.signal`

`ctx.signal`はWebSocket execution lifetimeを表す1本のAbortSignalとする。

HTTP phaseからhandlerまで同じsemanticを維持する。

```text
execution starts
   │
   ├ HTTP Upgrade phase
   ├ Layers
   ├ WebSocket session
   │
   └ CLOSED
        ↓
      abort
```

Upgrade前にrequest自体が継続不能になった場合もexecution signalをabortする。

Upgrade後はconnection CLOSED時点でabortする。

Application shutdown開始だけを理由に即abortせず、shutdownによるclose処理の結果connectionがCLOSEDになった時点でabortする。

これによりApplicationはlong-lived operationへ`ctx.signal`を渡してcooperative cancellationできる。

---

## 17. Incoming resource bounds

incoming dataはremote peerが生成量を制御できるため、無制限bufferを禁止する。

Runtime / driverは少なくとも次の両方に有限のresource boundを持つ。

```text
single complete message size
queued / unconsumed message data
```

具体的なdefault byte数 / message数はContract DSLへ含めずRuntime policyとする。

resource bound超過はschema validation failureとは異なる。

```text
validation failure
 -> Application policy
 -> isValid: false

resource exhaustion
 -> Runtime protection
 -> connection termination可
```

巨大messageを無制限にmemoryへ再構築してからvalidationする実装は禁止する。

---

## 18. Shutdown and drain

1 WebSocket connection = 1 active Application executionであるため、単に`ApplicationRuntime.shutdown()`でactive executionを待つだけでは永続connectionがshutdownを阻害する。

WebSocket Protocol executionはactive session registryとdrain lifecycleを所有する。

`ApplicationRuntime`へWebSocket固有概念を追加しない。

```text
application close
    │
    ├ stop accepting new executions
    ├ stop native listener from accepting new connections
    │
    ▼
protocol drain
    │
    ├ existing WS sessions -> Close 1001 Going Away
    ├ grace period
    └ timeout -> internal terminate
    │
    ▼
wait active executions == 0
    │
    ▼
DI / lifecycle cleanup
```

### 18.1 Drain race

WebSocket Protocol executionは少なくとも`running / draining / stopped` stateを持つ。

shutdown開始後に既にHTTP phaseへ入っていたrequestが`websocket.handler`へ到達しても、新規Upgradeをcommitしてはならない。

commit直前にdraining stateを検査し、HTTP phaseで終了させる。

### 18.2 Close 1001

既存active connectionは並列にClose 1001 Going Awayを開始する。

shutdown closeも通常send / close orderingを尊重するが、無期限には待たない。

close operation全体へ有限grace periodを設け、超過したtransportはinternal terminateする。

`ctx.terminate()`は公開しない。

### 18.3 JavaScript handlerは強制cancelしない

transportをterminateしても、Application handlerがcooperative cancellationを無視してnever-resolving Promiseを待っている場合、JavaScript execution自体を安全に強制終了することはできない。

LoutreはhandlerをdetachしたままDI lifecycle cleanupを開始しない。

ApplicationRuntimeは従来通りactive execution終了を待つ。

long-lived Application operationは`ctx.signal`を尊重する責任を持つ。

---

## 19. Protocol execution lifecycle ownership

Binding / Host側でProtocol executionのdrainを一般化する。

概念形:

```ts
interface ProtocolExecutionLifecycle {
  drain?(): Promise<void>
}
```

Application close orchestration:

```text
stop accepting Application executions
 -> stop Triggers
 -> drain Protocol executions
 -> ApplicationRuntime.shutdown()
```

HTTP等、追加drainが不要なProtocolはno-opでよい。

WebSocketだけの特殊メソッドを`ApplicationRuntime`へ追加しない。

self-hosted Runtime adapterではnative listenerの「新規受付停止」と「active connection終了待ち」を分離し、active WebSocketを即terminateしてからApplication drainする順序を避ける。

---

## 20. Runtime capabilities

WebSocket serverを必要とするApplicationは`websocket.server` capabilityを要求する。

WebSocket追加を機にGraph compilerへ次のようなprotocol名hard-codeを追加しない。

```ts
target.protocol === 'websocket'
```

既存の`ProtocolDescriptor.capabilities` / `ProtocolFactory.capabilities`をSource of Truthへ寄せる。

```text
Protocol descriptor / factory
        ↓
required capabilities
        ↓
Application Graph
        ↓
Runtime capability validation
```

既存HTTP / MessagePort capability generationに残るprotocol名hard-codeも、この変更で一般化することを推奨する。

---

## 21. Runtime adapter policy

Runtime固有のWebSocket APIをCoreへ漏らさない。

想定するnative integration例:

```text
Bun
  Bun.serve + server.upgrade + websocket callbacks

Deno
  Deno.upgradeWebSocket

Cloudflare Workers
  WebSocketPair

Node
  HTTP upgrade boundary + WebSocket driver
```

Node server側のRFC6455 frame implementationをLoutre Coreへ独自実装することは本ADRの目的ではない。具体的なNode driver / optional adapter dependencyの選定は実装PRで決定してよいが、Core packageへ不要なtransport依存を導入しない。

---

## 22. Error taxonomy

公開error classは必要以上に増やさない。

v1で必要な概念:

```text
SchemaValidationError
  shared Core schema validation failure

WebSocketMessageDecodeError
  incoming data message -> codec value failure

WebSocketMessageEncodeError
  validated output -> data message failure

WebSocketConnectionNotOpenError
  CLOSING / CLOSED connectionへのsend
```

transport固有error detailは必要に応じて`cause`へ保持し、Runtimeごとのerror classをApplicationへ漏らさない。

---

## 23. Public API summary

Protocol factory:

```ts
websocket(...)
websocket.route(...)
websocket.handler
websocket.json(...)
websocket.text(...)
websocket.binary(...)
```

handler context概念形:

```ts
interface WebSocketHandlerContext {
  readonly input: {
    readonly params: ...
    readonly query: ...
    readonly headers: ...
    readonly messages?: AsyncIterable<WebSocketIncomingMessage<...>>
  }

  readonly state: ...
  readonly logger: Logger
  readonly signal: AbortSignal

  send?(value: ...): Promise<void>
  close(code?: number, reason?: string): Promise<void>
  readonly closed: Promise<WebSocketCloseInfo>
}
```

実際の型では`messages` / `send`をoptional propertyとして常時存在させるのではなく、Contract declarationに応じてpropertyそのものを型から除外する。

---

## 24. Non-goals

v1では次を行わない。

- message name / event routing
- message-level Procedure / Pipeline
- Socket.IO互換API
- subprotocol negotiation public DSL
- GraphQL subscription adapter
- custom codec public API
- mixed text / binary raw codec
- framework-managed un-awaited send admission control
- WebSocket専用DI connection scope
- WebSocket-specific auth Layer
- Application author向けnative socket escape hatch
- public `ctx.accept()` / `ctx.upgrade()` / `ctx.terminate()`
- Contract DSL上のclose timeout / buffer byte設定

これらは具体的なユースケースが成立してから別ADRで追加する。

---

## 25. Implementation order

実装は概ね次の順序を推奨する。

1. Core Protocol model
   - `ProtocolDescriptor.entryProtocol`
   - capability derivationのprotocol hard-code整理
   - short-circuit validationをentry protocolへ対応

2. HTTP entry primitivesの共通化
   - params / query / headers raw / validated type utilities
   - HTTP response compatibility utilities

3. WebSocket Contract DSL / type tests
   - route tree
   - request / responses
   - message codec definitions
   - conditional handler context
   - dispatch key

4. Protocol execution
   - Upgrade driver boundary
   - session registry
   - incoming iterator
   - send serialization / backpressure
   - close state machine
   - drain

5. Runtime adapters
   - Bun
   - Deno
   - Cloudflare Workers
   - Node integration boundary

6. Integration / conformance tests
   - HTTP + WebSocket same path dispatch
   - auth short-circuit before Upgrade
   - JSON validation failure
   - text / binary codec behavior
   - send ordering
   - remote / local / abnormal close
   - handler return / throw
   - shutdown 1001 / forced transport termination
   - inbound resource bounds

---

## 26. Consequences

### Positive

- WebSocketをApplication Graph上のfirst-class Protocolとして扱える。
- 既存Pipeline / Layer / state inferenceをconnection lifetimeへそのまま適用できる。
- Basic / Bearer Auth等のHTTP Layerをopening phaseで再利用できる。
- transport / Runtime差をApplication sourceから隠蔽できる。
- Contractへ宣言していないmessage capabilityを型から消せる。
- message-level application protocolをLoutre Coreが発明しない。
- shutdown、backpressure、ordering、resource protectionをProtocol executionの責務として明確化できる。

### Negative

- 1 connection = 1 executionのため、long-lived handlerはshutdown semanticsへ直接影響する。
- Application handlerには`ctx.signal`を使ったcooperative cancellationが必要になる場合がある。
- Runtime adapterはnative Upgrade API差を吸収するbridgeを持つ必要がある。
- incoming AsyncIterable実装にはbounded bufferingが必要であり、単純なunbounded queueでは実装できない。
- NodeはBun / Deno / Cloudflare Workersほど単純なserver-side native WebSocket abstractionを持たないため、adapter方針を別途選定する必要がある。

---

## 27. Final architecture

```text
                         Application Graph
                               │
                     WebSocket Procedure
                               │
                     protocol = websocket
                    entryProtocol = http
                    interaction = duplex
                               │
                               ▼
                    HTTP Upgrade Request
                               │
                    ┌──────────┴──────────┐
                    │                     │
              request validation       Layers
                                      auth etc.
                    │                     │
                    └──────────┬──────────┘
                               │
                        websocket.handler
                        ─── commit ───
                               │
                               ▼
                      Runtime Upgrade Driver
                               │
                               ▼
                       WebSocket Connection
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       input.messages        send()           close()
              │                │                │
        decode/schema     ordered queue     CLOSING
              │            backpressure        │
              └────────────────┼────────────────┘
                               │
                               ▼
                             CLOSED
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              ctx.closed resolve     ctx.signal abort
                    │                     │
                    └──────────┬──────────┘
                               ▼
                       Pipeline unwind
                               │
                               ▼
                    Application execution ends
```

LoutreのWebSocket supportは「socket objectを薄く包むAPI」ではなく、HTTP entry phaseからconnection shutdownまでをApplication Graph / Pipeline / Runtime lifecycleへ統合するProtocol executionとして実装する。
