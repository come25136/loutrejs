# v0.11.1 からの公開 API 移行

## HTTP

Contractの名前付き `responses` はそのまま使えます。各Handlerで返す応答を `schema` に指定してください。

```ts
const UsersContract = http.contract({
  get: {
    method: 'GET',
    path: '/user',
    responses: {
      detail: {
        status: 200,
        body: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
})

const UsersHttp = http.implementation({
  contract: UsersContract,
  factory: (users = inject(UserRepository)) => ({
    async get() {
      return { schema: UsersContract.get.detail, body: await users.getDetail() }
    },
  }),
})
```

- `ctx.response.ok({ body, headers })` を `{ schema: Contract.operation.ok, body, headers }` に変更します。単一応答にも参照が必要です。204は `{ schema: Contract.remove.noContent }`、SSEは `body` に `AsyncIterable` を渡します。
- `createHttpClient`、`fetchHttpTransport`、`HttpClientResponseError`、`httpBaseUrl` と関連する型を削除しました。HTTP の呼び出しには標準の `fetch()` などを使えます。サーバーのテストでは `app.http.fetch(new Request(url))` から Handler を実行できます。
- Handler とエラーマッピングが返す body は応答スキーマの入力型です。たとえば `z.string().transform(Number)` には `'42'` を返し、HTTP クライアントは数値の `42` を受け取ります。SSE でも各要素に同じ規則を適用します。
- 応答定義を変数に切り出す場合は `as const satisfies HttpExecutionResponseDefinition` で形を検査しつつ、status のリテラル型と body のスキーマ型を保持できます。
- 継承した応答には最終的なContractのoperationからアクセスします。子Contractと親Contractの参照はそれぞれのContractに属します。応答名には文字列を使います。Symbol キーは宣言時にエラーになります。`kind` と `routes` は予約名なので、該当するoperation名と実装メソッド名を一緒に変更してください。
- 業務エラーは `domainError` で定義してthrowし、Contractの `http.error` に対応付けます。Middlewareの認証失敗は従来の `{ response, body }`、raw/delegateはFetchの `Response` を使います。
- クラスのメソッドでは、`@loutrejs/loutre/http` から `HttpHandlerContext` を型として import し、`get(ctx: HttpHandlerContext<typeof UsersContract, 'get'>)` と書けます。`ctx.input` と `ctx.state` の型は、その操作のリクエストスキーマと Middleware から決まります。

クラスの内部ヘルパーには JavaScript の `#` メソッドを使います。TypeScript の `private getDetail()` は実行時に通常の名前付きメソッドとして残り、起動時に契約外のハンドラとして検出されます。

```ts
class UsersController {
  #getDetail() {
    return { id: '1', name: 'もみじ' }
  }

  get() {
    return { schema: UsersContract.get.detail, body: this.#getDetail() }
  }
}

const UsersHttp = http.implementation({
  contract: UsersContract,
  factory: () => new UsersController(),
})
```

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

アプリの宣言には公開名の `module` と `application` をそのまま使います。定義を `AppModule`・`appDefinition`、起動済みインスタンスを `app` と呼び分けると、同じスコープで扱えます。

```ts
import { application, bootstrapApplication, module } from '@loutrejs/loutre'

const AppModule = module({ executions: [UsersHttp] })
const appDefinition = application({ modules: [AppModule] })
await using app = await bootstrapApplication({ application: appDefinition })
```

`task` は処理本体、`queue` はpayloadとdriverの定義です。TriggerとProviderは各Moduleへ明示的に登録します。Runtimeの起動・接続とExtension作者向けAPIについては[設計判断](../adr/loutre_framework_public_api_redesign.md)を参照してください。
