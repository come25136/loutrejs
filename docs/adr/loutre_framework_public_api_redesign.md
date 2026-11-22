# Loutre Framework-wide Public API Redesign

- ステータス: Accepted
- 日付: 2026-11-21 JST
- 対象: Frameworkの公開API、型、Contract/Implementation/Module/Applicationの接続、Migration
- 参照: [Framework-wide Public API RFC (Notion)](https://app.notion.com/p/41f4ead6c4f5819eb41dc529e78df26f?pvs=204)
- 置換範囲: HTTP応答、MCP Tool契約、Trigger、アプリ作者向け定義、HTTP middleware、CLI entry。
- 関連: [Application Graph Kernel](./loutre_application_graph_kernel_architecture.md)、[Execution Extension](./loutre_execution_extension_contract_architecture.md)、[Contract-first Tooling](./loutre_contract_first_tooling_architecture.md)、[HTTP Protocol Delegation](./loutre_http_protocol_delegation.md)、[MCP Server](./loutre_mcp_server_architecture.md)、[GraphQL Transport](./loutre_graphql_transport_architecture.md)

## 背景

LoutreのPublic APIはContract-first、明示的なModule境界、canonical Application Model、Execution ownershipを持つ。一方、HTTP応答を返すための `ctx.response.ok({ body })`、複数箇所に分かれたMCP Toolの名前、TaskとQueueを起動するAPI、Module/Env/Argsの命名など、アプリ作者の視点では覚える規則が分散している。

これは「すべて同じメソッド名にする」問題ではない。Protocolごとの意味、Schemaの選択、DIの所有権、Runtimeの寿命を保ったまま、同じ意味の重複表現を減らす。破壊的変更は許容し、最終的な正規APIは一種類にする。

## 不変条件

1. Contract / SDL / Schemaが表す情報をImplementationへ二重宣言させない。
2. Contract → Implementation → Module → Applicationの組立と、明示的なimports/exports/providers/executions/delegationを維持する。
3. TypeScriptの入出力保証だけでなく、canonical Modelのroute衝突、owner、DI visibility、capability等の検証を維持する。
4. FactoryはExecutionインスタンスの寿命を表す。requestごとの依存取得へ無条件に置き換えない。
5. Runtime、Host、Protocol Extensionの境界を維持し、動的探索/暗黙Provider登録/Decorator scanは追加しない。
6. HTTP、WebSocket、MessagePort、MCP、GraphQL、Taskなどで意味の異なる情報を、見た目の統一だけのために同じDSLへ押し込まない。
7. Contract単独ToolingとApplication Model起点Toolingは既存ADRの境界を維持し、OpenAPIのprojection同値性を崩さない。
8. 最終移行後に旧記法を別の「推奨API」として残さない。Breaking changeは型・Runtime回帰テストで検証する。

## 決定1: HTTP Contractは維持し、短いResponse Referenceを公開する（採用）

### 正規API

既存の `http.contract({...})` の入力形式と、`responses` の名前付きキー、各status/Schema定義は **変更しない**。一方、Contractから得られるレスポンス定義へのアクセスを `UsersContract.get.ok` に短縮する。

```ts
const UsersContract = http.contract({
  get: {
    method: 'GET',
    path: '/users/{id}',
    request: { params: { id: z.string() } },
    responses: {
      ok: { status: 200, body: UserSchema },
    },
  },
})

const UsersHttp = http.implementation({
  contract: UsersContract,
  factory: (users = inject(UserRepository)) => ({
    async get(ctx) {
      const user = await users.find(ctx.input.params.id)
      return {
        schema: UsersContract.get.ok,
        body: user,
      }
    },
  }),
})
```

`UsersContract.get.ok` は単なるZodのbody schemaではなく、**status・body・headers・stream等を持つresponse definitionの参照**である。公開Handlerの成功結果は常に `{ schema: reference, body?, headers? }` のオブジェクトとする。数値 `status`、文字列 `response` / `kind`、あるいは直接bodyを返す設計へは戻さない。

Handlerは短縮参照を使う。既存の `routes` プロパティはGraphQL/MCPのraw route参照等で使われるため、単純に削除したり意味を変えたりしない。

### Error mapping、SSE、Headers、Bodyless

DomainErrorは従来どおり `throw` し、Contractの `error: http.error(UserNotFound)` がHTTPレスポンスへの変換を所有する。`http.error()` 自体はthrowではなく変換ルールの宣言。error-mapped responseは通常の成功Handler return候補に含めない。未知の例外は既存の500経路へ送る。

```ts
const EventsContract = http.contract({
  events: {
    method: 'GET',
    path: '/events',
    interaction: 'server-stream',
    responses: {
      ok: { status: 200, stream: 'server', body: EventSchema },
      partial: { status: 206, stream: 'server', body: EventSchema },
    },
  },
})

const EventsHttp = http.implementation({
  contract: EventsContract,
  factory: (events = inject(EventService)) => ({
    events(ctx) {
      return {
        schema: EventsContract.events.ok,
        body: events.subscribe(ctx.signal),
      }
    },
  }),
})
```

Handlerとエラーマッピングはbodyスキーマの入力型を返し、HTTP Runtimeが検証・変換した出力を送信する。SSEのbodyは対応する `AsyncIterable<SchemaInput<...>>`。要素単位のSchema検証、SSE framing、Content-Type、Abort/Drain、Iterator cleanup、Execution leaseを維持する。別statusのstreamも `EventsContract.events.partial` を指定すれば一意に決まる。bodylessな204等は `{ schema: Contract.operation.noContent }`、動的headersは `{ schema, body, headers }` とし、Contractのheaders定義・defaultsへ従う。通常Contract HandlerからFetch `Response` を直接返して型保証を迂回しない（raw/delegateは別経路）。

### 応答の所属と検証

- 応答名には文字列を使い、SymbolキーはContract宣言時に拒否する。Contractのoperation keyとresponse keyを補完し、`schema` 参照とbody/headers/streamの型相関を保持する。誤ったレスポンス、別operation/別Contractのreference、型不一致を拒否する。
- 現行 `HttpContract` は `kind` / `routes` を持つ。これらとoperation名の衝突を無言で上書きせず、型とRuntimeで安全に扱う（両方を予約名として型と実行時に拒否）。
- Contract作成時にoperationごとの応答定義を個別にスナップショット化する。HTTP実行とreplayは同じcompiled routeを使用し、そのルートの成功応答に登録された参照だけを受け付ける。DevToolsの `http.handler` の実行記録とreplay結果では、選択された応答参照を `schema` にその名前で表示する。同じ入力オブジェクトで二つのContractを作っても、その所属は別になる。
- 型のbrandにはルート集合・operation名・response名を含める。全く同じ宣言から複数回生成した値にはTypeScriptが同じ型を推論するため、インスタンス間の所属検証はRuntimeで行う。
- Branch継承のresponseも短縮参照で型安全に取得できる。raw route、GraphQL/MCP委譲、OpenAPIの既存契約を維持する。
- 従来の `ctx.response.*` を公開Contract Handlerから削除し、deprecated aliasを残さない。HTTP Middlewareのshort circuitは別責務として明示的に保持する。

HTTP の公開 API はサーバー側の Contract、Handler、OpenAPI を対象とする。Contract から呼び出し側の HTTP クライアントを生成する機能は削除する。

### 却下した選択肢

| 候補                                                        | 見送る理由                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `return body`                                               | 返却Schema/statusを一意に指定できず、明示Result方針と異なる           |
| `return { response: 'ok', body }` / `{kind:'ok',body}`      | 文字列による間接指定。契約定義の参照より冗長・弱い                    |
| `return { schema: Contract.routes.get.responses.ok, body }` | 参照パスが長く、既存helperよりDXが悪い                                |
| `return { ok: body }`                                       | headers等のenvelope表現と、複数キー検出のための追加規約が必要         |
| `ctx.response.ok({body})`                                   | 現行APIとしては簡潔だが、値を返すためにcontext helperを呼ぶ必要がある |

## 決定2: Public APIの統一原則（既存方針を維持）

次の境界は既存Architectureを尊重し、特定の名前の一斉置換を本ADRの決定としない。

- WebSocket: `websocket.contract` / `websocket.implementation`、handshake・session・message codecと寿命はWebSocket固有のまま。
- MessagePort: `messagePort.contract` / `messagePort.implementation`、unary/streamとattach bridgeの役割を維持。
- GraphQL: SDL → codegen → `bindManifest` → `graphql.implementation`。 `graphql.contract()` は増やさず、HTTP Contract raw routeをtransport入口の正本とする。
- Runtime: `nodeRuntime.create` / `bunRuntime.create`、Workers/Lambdaの `bind`、Electronの `attach` は所有権が違う。単一の `start()` に統一しない。
- DI/Graph: ProviderはModuleへ明示登録、Model時probeとRuntime宣言照合、owner/visibilityとKernel resolverの境界を維持。
- Logger: `LoggerModule` / `LoggerToken` の標準経路とoverrideを明確にし、暗黙Provider登録はしない。
- Tooling: OpenAPIはContract単独またはApplication Modelから生成可能、Graph/doctorはApplication-awareのまま。Graph/DevToolsのためだけにDefinitionを変えない。

## 決定3: MCP Tool契約

Tool名はContractのキーとして宣言する。EndpointがOAuthと実行時の依存関係を所有する。

```ts
const CounterContract = mcp.contract({
  'counter.get': {
    description: '現在値を取得する',
    scopes: ['counter:read'],
    input: z.strictObject({}),
    output: z.object({ value: z.number() }),
  },
  'counter.increment': {
    description: '値を加算する',
    scopes: ['counter:write'],
    input: z.strictObject({ by: z.number().int().positive() }),
    output: z.object({ value: z.number() }),
  },
})

const CounterMcp = mcp.implementation({
  name: 'counter',
  version: '1.0.0',
  contract: CounterContract,
  route: ApiContract.routes.mcp,
  factory: (counter = inject(CounterService), auth = inject(AuthService)) => ({
    oauth: auth.mcp,
    tools: {
      'counter.get': () => ({ value: counter.get() }),
      'counter.increment': ({ input: { by } }) => ({
        value: counter.increment(by),
      }),
    },
  }),
})
```

キーをTool名の正本とし、必須・余剰Tool・型の不一致を検査する。各Toolは検証後のinput、検証済みのprincipal、signal、request、HTTP middlewareのstateをひとつのオブジェクトで受け取る。認証なしのendpointは `oauth: false` で明示し、principalは `undefined` となる。OAuth、requiredScopes、Endpoint ownership、HTTP delegate、JSON Schema対応は維持。Toolを個別Executionに分けず、同名Toolの異なるEndpoint間共存を許す。旧tool配列との併用による二重source of truthは認めない。

## 決定4: Task / Trigger / Queueの意味境界

```ts
const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {},
})

const heartbeat = trigger.fixedDelay({
  name: 'heartbeat',
  task: cleanup,
  delay: 5_000,
})

const orders = queue({ name: 'orders', payload: OrderSchema })
const worker = trigger.consume({
  name: 'orders.worker',
  queue: orders,
  task: processOrder,
})
```

`task` は処理本体、`trigger.cron/fixedDelay/consume` は起動条件、`queue` はpayloadとdriverを持つdescriptorとして区別する。起動条件をModuleのexecutionsへ登録し、Queue driverをprovidersから供給する。

## 決定5: 定義、Middleware、CLI

アプリ作者が定義する対象は `application`、`module`、`env`、`args`、`domainError` という名詞でそろえる。Extension作者が扱う構築プリミティブには `defineExecution`、`defineExecutionExtension`、`defineLayer` を使う。依存を解決するFactoryの寿命と、Moduleへの明示的なProvider登録は従来のままとする。

HTTP固有のLayerは `http.basicAuth`、`http.bearerAuth`、`http.cors` で構築する。認証失敗に用いるMiddlewareのshort circuitは、Handlerから独立した契約を持つ。アプリをロードするCLIコマンドでは `--entry` で対象を指定する。GraphQLの生成設定には `--config` を使う。

## Runtimeと組み込みModule

| API                                                       | 資源の所有者と利用方法                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `nodeRuntime.create` / `bunRuntime.create`                | Applicationを生成し、呼び出し側が `serve()` と `close()` を管理する                     |
| `cloudflareWorkersRuntime.bind` / `awsLambdaRuntime.bind` | プラットフォームにfetchまたはLambda handlerを渡す                                       |
| `electronRuntime.attach`                                  | ホストが所有するMessagePortに接続する                                                   |
| `bootstrapApplication` / `createKernelApplication`        | 初期化済みKernelを取得する場合と、初期化を個別に制御する場合に使い分ける                |
| `LoggerModule` / `DevtoolsModule()`                       | Loggerの標準Moduleは定義済みインスタンス。DevToolsは明示的なfactory呼び出しで有効化する |

GraphQLはSDLと生成Manifest、WebSocketは接続とcodec、MessagePortはunary/streamとvariantの契約を維持する。それぞれの実行と終了処理はProtocol ExtensionとRuntimeが所有する。
