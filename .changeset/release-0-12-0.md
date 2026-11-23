---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
'@loutrejs/graphql': minor
'@loutrejs/mcp': minor
---

HTTP の応答と MCP Tool を Contract から型付け・検証するように変更しました。0.11.x から更新するアプリでは、次の公開 API を変更してください。

- HTTP ハンドラは `ctx.response.*` の代わりに `{ schema: UsersContract.get.ok, body }` を返します。サーバーは選択した応答のスキーマで body を検証・変換します。クラスハンドラの引数型には `HttpHandlerContext<typeof UsersContract, 'get'>` を使えます。
- `@loutrejs/loutre/http` から `createHttpClient`、`fetchHttpTransport` と関連 API を削除しました。HTTP 呼び出しには標準の `fetch()`、サーバーのテストには `app.http.fetch()` を使えます。
- MCP は個別の `mcp.tool()` と Tool 配列を、Tool 名をキーにした `mcp.contract()` に置き換え、`mcp.implementation({ contract, ... })` に渡します。`factory.context` は廃止しました。Tool ハンドラは `({ input, principal, signal, request, state })` の形で検証後の入力と呼び出し情報を受け取ります。
- MCP の OAuth 認証を使う場合は、endpoint の `oauth` に `requiredScopes` または `allowedOrigins` を設定し、factory から `oauth` と `tools` を返してください。共通 scope が不要でもトークンを必須にする場合は `oauth: { requiredScopes: [] }` を指定します。endpoint の `oauth` を省略するか `undefined` にすると認証なしになり、scope 付き Tool は登録時に拒否されます。空オブジェクトと `false` は指定できません。
- `defineApplication`、`defineModule`、`defineEnv`、`defineArgs`、`defineError` を、それぞれ `application`、`module`、`env`、`args`、`domainError` に改名しました。HTTP middleware は `http.basicAuth`、`http.bearerAuth`、`http.cors` から使います。
- Task の起動条件は `trigger.cron`、`trigger.fixedDelay`、`trigger.consume` で宣言します。`fixedDelay` はタイマーの上限を超える長い待機時間にも対応します。
- CLI のビルドコマンドを `loutre build <entry>` から `loutre build --entry <entry>` に変更しました。
