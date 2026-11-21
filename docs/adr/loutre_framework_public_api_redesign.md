# Loutre Framework-wide Public API Redesign

- ステータス: Proposed（個別に採用済みの設計判断を含む）
- 日付: 2026-11-21 JST
- 対象: Frameworkの公開API、型、Contract/Implementation/Module/Applicationの接続、Migration
- 参照: [Framework-wide Public API RFC (Notion)](https://app.notion.com/p/41f4ead6c4f5819eb41dc529e78df26f?pvs=204)
- 置換範囲: 通常HTTP Handlerの公開Result記法のみを更新対象とする。Kernel、Protocol委譲、現行MCP契約、OpenAPIのContract-first境界は維持する。
- 関連: [Application Graph Kernel](./loutre_application_graph_kernel_architecture.md)、[Execution Extension](./loutre_execution_extension_contract_architecture.md)、[Contract-first Tooling](./loutre_contract_first_tooling_architecture.md)、[HTTP Protocol Delegation](./loutre_http_protocol_delegation.md)、[MCP Server](./loutre_mcp_server_architecture.md)、[GraphQL Transport](./loutre_graphql_transport_architecture.md)

## 背景

LoutreのPublic APIはContract-first、明示的なModule境界、canonical Application Model、Execution ownershipを持つ。一方、HTTP応答を返すための `ctx.response.ok({ body })`、複数箇所に分かれたMCP Toolの名前、TaskとQueueを起動するAPI、Module/Env/Argsの命名など、アプリ作者の視点では覚える規則が分散している。

これは「すべて同じメソッド名にする」問題ではない。Protocolごとの意味、Schemaの選択、DIの所有権、Runtimeの寿命を保ったまま、同じ意味の重複表現を減らす。破壊的変更は許容し、最終的な正規APIは一種類にする。

本ADRでは **HTTP応答の新しい記法を採用する設計決定**として明記する。他の領域の候補は検証と別PRが必要な **提案**と区別する。このPRは設計ドキュメントのみで、現時点でランタイムの挙動は変更しない。

## 不変条件

1. Contract / SDL / Schemaが表す情報をImplementationへ二重宣言させない。
2. Contract → Implementation → Module → Applicationの組立と、明示的なimports/exports/providers/executions/delegationを維持する。
3. TypeScriptの入出力保証だけでなく、canonical Modelのroute衝突、owner、DI visibility、capability等の検証を維持する。
4. FactoryはExecutionインスタンスの寿命を表す。requestごとの依存取得へ無条件に置き換えない。
5. Runtime、Host、Protocol Extensionの境界を維持し、動的探索/暗黙Provider登録/Decorator scanは追加しない。
6. HTTP、WebSocket、MessagePort、MCP、GraphQL、Taskなどで意味の異なる情報を、見た目の統一だけのために同じDSLへ押し込まない。
7. Contract単独ToolingとApplication Model起点Toolingは既存ADRの境界を維持し、OpenAPIのprojection同値性を崩さない。
8. 最終移行後に旧記法を別の「推奨API」として残さない。Breaking changeにはMigration Guideと型・Runtime回帰テストを必須とする。

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

これにより `ctx.response.ok({ body })` は削除できるが、`UsersContract.routes.get.responses.ok` をHandlerに繰り返し記述させる必要もない。既存の `routes` プロパティはGraphQL/MCPのraw route参照等で使われるため、単純に削除したり意味を変えたりしない。

### 同じstatusに複数のSchema

```ts
const UsersContract = http.contract({
  get: {
    method: 'GET',
    path: '/users/{id}',
    request: {
      params: { id: z.string() },
      query: z.object({ detail: z.boolean().optional() }),
    },
    responses: {
      ok: { status: 200, body: UserSummarySchema },
      detailed: { status: 200, body: DetailedUserSchema },
    },
  },
})

const UsersHttp = http.implementation({
  contract: UsersContract,
  factory: (users = inject(UserRepository)) => ({
    async get(ctx) {
      const user = await users.find(ctx.input.params.id)
      if (ctx.input.query.detail) {
        return {
          schema: UsersContract.get.detailed,
          body: users.toDetailed(user),
        }
      }
      return {
        schema: UsersContract.get.ok,
        body: users.toSummary(user),
      }
    },
  }),
})
```

`ok` / `detailed` はともにHTTP 200であっても別レスポンス。Runtimeは選ばれたreferenceに対応する **一つのSchema** を検証する。bodyの形状や最初に一致したSchema、あるいはstatusだけから名前付きレスポンスを推測してはならない。これによりZodが未知のプロパティをstripする場合も、違うSchemaでデータを変換してしまう問題を防ぐ。

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

SSEのbodyは対応する `AsyncIterable<SchemaOutput<...>>`。要素単位のSchema検証、SSE framing、Content-Type、Abort/Drain、Iterator cleanup、Execution leaseを維持する。別statusのstreamも `EventsContract.events.partial` を指定すれば一意に決まる。bodylessな204等は `{ schema: Contract.operation.noContent }`、動的headersは `{ schema, body, headers }` とし、Contractのheaders定義・defaultsへ従う。通常Contract HandlerからFetch `Response` を直接返して型保証を迂回しない（raw/delegateは別経路）。

### 型とRuntimeに求める保証

- Contractのoperation keyとresponse keyを補完し、`schema` 参照とbody/headers/streamの型相関を保持する。誤ったレスポンス、別operation/別Contractのreference、型不一致を拒否する。
- 現行 `HttpContract` は `kind` / `routes` を持つ。これらとoperation名の衝突を無言で上書きせず、型とRuntimeで安全に扱う（compile時診断や別の安全なアクセス設計を検討）。
- `http.contract` における解決・スナップショット化、compile、Application間の共有、DevTools replayの各段階でresponse definitionの安定したidentityを扱う。単なる `===` や同じ構造であることを根拠に他Routeの参照を受け入れない。必要ならnominal branding / canonical identityを設計する。
- Branch継承のresponseも短縮参照で型安全に取得できる。raw route、GraphQL/MCP委譲、OpenAPI、HTTP clientの既存契約を壊さない。
- 従来の `ctx.response.*` を公開Contract Handlerから削除し、deprecated aliasを残さない。HTTP Middlewareのshort circuitは別責務として明示的に保持する。

### 却下した選択肢

| 候補                                                        | 見送る理由                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `return body`                                               | 返却Schema/statusを一意に指定できず、明示Result方針と異なる           |
| `return { status: 200, body }`                              | 同じstatusの複数Schemaを区別できない                                  |
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

## 提案1: MCPをContract-firstに統一（未採用）

現行の `mcp.tool({ name,... })` と `tools: []`、実装側の `tools: {...}` に生じる名前の重複を減らす。

```ts
const CounterContract = mcp.contract({
  'counter.get': {
    description: 'Get the current counter.',
    input: z.strictObject({}),
    output: z.object({ value: z.number() }),
  },
  'counter.increment': {
    description: 'Increment the counter.',
    input: z.strictObject({ by: z.number().int().positive() }),
    output: z.object({ value: z.number() }),
  },
})

const CounterMcp = mcp.implementation({
  name: 'counter',
  version: '1.0.0',
  contract: CounterContract,
  route: HttpApi.routes.mcp,
  factory: (counter = inject(CounterService)) => ({
    tools: {
      'counter.get': () => ({ value: counter.get() }),
      'counter.increment': ({ by }) => ({ value: counter.increment(by) }),
    },
  }),
})
```

キーをTool名の正本とし、必須・余剰Tool・型の不一致を検査する。OAuth、requiredScopes、Tool context、Endpoint ownership、HTTP delegate、JSON Schema対応は維持。Toolを個別Executionに分けず、同名Toolの異なるEndpoint間共存を許す。旧tool配列との併用による二重source of truthは認めない。MCP全機能で表現可能かを別PRで検証してから採否を確定する。

## 提案2: Task / Trigger / Queueの意味境界（未採用）

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

`task` は処理本体、`trigger.cron/fixedDelay/consume` は起動条件、`queue` はpayloadとdriverを持つdescriptorとして区別する。現行APIの単純なrenameは決定しない。Queue driver binding、Cron timezone/overlap、Task closure、shutdownを維持して検証する。

## 提案3: Core命名・Middleware facade・CLIの整理（未採用）

- `defineApplication` / `defineModule` / `defineEnv` / `defineArgs` / `defineError` を **一括** で評価する。名詞系 `application()` / `module()` / `env()` / `args()` 等は候補であり、単独renameを決定しない。
- Extension作者向け `defineExecution` / `defineExecutionExtension` / `defineLayer` は低レベル構築APIとして分離し、命名統一だけを目的に変更しない。
- `http.cors` / `http.basicAuth` / `http.bearerAuth` のfacade統一は候補だが、Generic middlewareやProtocol委譲を混同しない。認証成功/失敗の短絡表現はHTTP Handlerの新Resultとは別に設計・検証する。
- LoggerModule / DevtoolsModule()のインスタンス生成規則、Module lifecycle、DI Probeとclass prototype methodの型補助を確認。DecoratorやLanguage Serviceは必須にしない。
- CLIの同種entry引数は `--entry` を候補とする。GraphQLの `--config` は別の意味なのでそのまま。Runtime別のCreate/Bind/Attachの違いは説明で揃え、挙動を平坦化しない。

## 移行と実装順序

変更を単一の巨大実装PRへまとめず、小さい検証可能なPRへ分割する。

1. **P0: HTTP** Contractが `UsersContract.get.ok` を公開する型・Runtime・Conflict detectionを設計。Handler Resultを `{ schema, body?, headers? }` へ更新。 `ctx.response` 削除、Error mapping、SSE、bodyless、nested responses、OpenAPI/Client/DevTools回帰、Migration Guideを整える。
2. **P1: MCP** Contract-firstの型計算とOAuth/Tool parityをPoCで検証し、採用後に専用ADR/PRで移行。
3. **P2: Task/Queue** Triggerの役割分割、driver/queue/Taskの一致を型・Runtimeで確認。
4. **P3: Core命名/Middleware** 同一原則で一括決定し、aliasを増やさず移行する。
5. **P4: GraphQL/WS/MessagePort** 新抽象化ではなく境界の明文化と型・DX回帰を中心にする。
6. **P5: Runtime/CLI/DevTools/Docs** スターター、導線、Migration、公開API smokeを揃える。

## 受け入れ条件

### 型テスト

- HTTP: `UsersContract.get.ok` がoperation固有のresponse referenceとして補完され、正しいbody/headers/SSEのみ許可する。
- HTTP: `schema` に別operation・別Contract・error-mapped responseを渡すと拒否する。 `kind` / `routes` などoperation名衝突を誤解決しない。
- HTTP: 同じstatusを持つ二つのbody Schemaをreferenceで区別する。単一レスポンスでも直接body返却は型エラー。
- Classのprototype method、Factoryの文脈型、欠落・余剰handlerを検証。
- MCP、Queue/Task、MessagePort、WebSocketの各Contract整合性を、個別候補採用時に検証する。

### RuntimeとTooling

- Contract→compiled route→Handlerの参照対応を正しく正規化し、Application複数作成、Branch継承、DevTools replayでもidentityを誤認しない。
- HTTPの同status別Schema、SSEの逐次検証、Abort/cleanup/lease、204、headers、DomainError mapping、Middleware short circuitを回帰確認する。
- OpenAPIのContract-only / Application経由projection同値、GraphやCLI diagnostics、GraphQL/MCP raw delegateを維持する。
- Node、Bun、Cloudflare Workers、AWS Lambda、Electronの既存capability/lifecycle境界を維持する。
- 最終実装PRで `npm run verify` を実行し、Type-level/Runtime/Examples/Docsを更新する。**本ADRだけのPRでは実装テストの成功を主張しない**。

## 未解決・実装時の論点

1. `UsersContract.get.ok` を公開する際の `kind` / `routes` / Built-in propertyとの名前衝突: compile-time禁止か安全な代替配置か。
2. Response referenceのnominal identity/brandと、Compiler/Runtime/replay間での安定化。単純なオブジェクト同一性には依存しない。
3. response definitionが構造的に同型でも型・Runtime双方で別Operation参照を防ぐ保証方法。
4. HTTP Middlewareのshort circuitとerror mappingの内部Result表現を、公開Handler結果変更にどう追従させるか。
5. Core/MCP/Trigger/CLIで提案したAPIの採否と移行タイミング。**未確定案は本ADRの採択をもって実装承認と見なさない**。

## 非目標

- このADRのPRで実装、リリース、既存実装の一斉migrationを行うこと。
- Contract/SDL/Modelを廃止すること。
- GraphQL/MCPのTransport、WebSocketの接続寿命、各Runtimeの所有権を無理に統一すること。
- Providerの自動探索、任意のHandler内inject、Decorator/Language Serviceの導入。
- ADR本文の候補APIを「すでに実装済み」と扱うこと。
