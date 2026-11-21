# v0.11.1 からの公開 API 移行

## HTTP

Contractの名前付き `responses` はそのまま使えます。各Handlerで返す応答を `schema` に指定してください。

```ts
const Users = http.contract({
  get: {
    method: 'GET',
    path: '/user',
    responses: {
      summary: { status: 200, body: z.strictObject({ id: z.string() }) },
      detail: {
        status: 200,
        body: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
})

const UsersHttp = http.implementation({
  contract: Users,
  factory: (users = inject(UserRepository)) => ({
    async get() {
      return { schema: Users.get.detail, body: await users.getDetail() }
    },
  }),
})
```

- `ctx.response.ok({ body, headers })` を `{ schema: Contract.operation.ok, body, headers }` に変更します。単一応答にも参照が必要です。204は `{ schema: Contract.remove.noContent }`、SSEは `body` に `AsyncIterable` を渡します。
- 同じ status の場合、型付きクライアントは受信した body と headers が一つの応答スキーマに一致したときに復元します。複数に一致すると `HttpClientResponseError` が発生します。公開上も区別する場合は、上の例のようにスキーマを排他的にするか、body に識別用の値を宣言してください。
- 継承した応答には最終的なContractのoperationからアクセスします。子Contractと親Contractの参照はそれぞれのContractに属します。`kind` と `routes` は予約名なので、該当するoperation名と実装メソッド名を一緒に変更してください。
- 業務エラーは `domainError` で定義してthrowし、Contractの `http.error` に対応付けます。Middlewareの認証失敗は従来の `{ response, body }`、raw/delegateはFetchの `Response` を使います。
- クラスを使う場合、メソッド引数に `Parameters<HttpHandlers<typeof Users>['get']>[0]` を指定できます。別に宣言したクラスへは、Factory内のオブジェクトリテラルに効く文脈型推論が届かないためです。

## MCP

`mcp.tool({ name, description, scopes, input, output })` と実装の `tools: [...]` を、名前をキーにした `mcp.contract({ [name]: { description, scopes, input, output } })` と `mcp.implementation({ contract, ... })` に置き換えます。Factoryの `tools` に対応するメソッドを実装します。OAuth、HTTP raw route、呼び出しごとのContextの設定例は[MCPガイド](../../packages/mcp/README.md)を参照してください。

## importとCLI

| v0.11.1                                    | 移行先                                                    | 用途                                              |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| `defineApplication` / `defineModule`       | `application` / `module`                                  | Applicationと静的・動的Moduleの定義               |
| `defineEnv` / `defineArgs` / `defineError` | `env` / `args` / `domainError`                            | 環境・引数の検証と業務エラーの定義                |
| `cron` / `fixedDelay` / `consume`          | `trigger.cron` / `trigger.fixedDelay` / `trigger.consume` | `@loutrejs/loutre/tasks` から `trigger` をimport  |
| `basicAuth` / `bearerAuth` / `cors`        | `http.basicAuth` / `http.bearerAuth` / `http.cors`        | `@loutrejs/loutre/http` から `http` をimport      |
| `loutre build src/app.ts`                  | `loutre build --entry src/app.ts`                         | package.jsonのscripts、CI、デプロイコマンドも更新 |

`task` は処理本体、`queue` はpayloadとdriverの定義です。TriggerとProviderは各Moduleへ明示的に登録します。Runtimeの起動・接続とExtension作者向けAPIについては[設計判断](../adr/loutre_framework_public_api_redesign.md)を参照してください。
