# @loutrejs/mcp

## 0.12.0

### Minor Changes

- 7710e2d: HTTP の応答と MCP Tool を Contract から型付け・検証するように変更しました。0.11.x から更新するアプリでは、次の公開 API を変更してください。

  - HTTP ハンドラは `ctx.response.*` の代わりに `{ schema: UsersContract.get.ok, body }` を返します。サーバーは選択した応答のスキーマで body を検証・変換します。クラスハンドラの引数型には `HttpHandlerContext<typeof UsersContract, 'get'>` を使えます。
  - `@loutrejs/loutre/http` から `createHttpClient`、`fetchHttpTransport` と関連 API を削除しました。HTTP 呼び出しには標準の `fetch()`、サーバーのテストには `app.http.fetch()` を使えます。
  - MCP は個別の `mcp.tool()` と Tool 配列を、Tool 名をキーにした `mcp.contract()` に置き換え、`mcp.implementation({ contract, ... })` に渡します。`factory.context` は廃止しました。Tool ハンドラは `({ input, principal, signal, request, state })` の形で検証後の入力と呼び出し情報を受け取ります。
  - MCP の OAuth 認証を使う場合は、endpoint の `oauth` に `requiredScopes` または `allowedOrigins` を設定し、factory から `oauth` と `tools` を返してください。共通 scope が不要でもトークンを必須にする場合は `oauth: { requiredScopes: [] }` を指定します。endpoint の `oauth` を省略するか `undefined` にすると認証なしになり、scope 付き Tool は登録時に拒否されます。空オブジェクトと `false` は指定できません。
  - `defineApplication`、`defineModule`、`defineEnv`、`defineArgs`、`defineError` を、それぞれ `application`、`module`、`env`、`args`、`domainError` に改名しました。HTTP middleware は `http.basicAuth`、`http.bearerAuth`、`http.cors` から使います。
  - Task の起動条件は `trigger.cron`、`trigger.fixedDelay`、`trigger.consume` で宣言します。`fixedDelay` はタイマーの上限を超える長い待機時間にも対応します。
  - CLI のビルドコマンドを `loutre build <entry>` から `loutre build --entry <entry>` に変更しました。

### Patch Changes

- Updated dependencies [7710e2d]
  - @loutrejs/loutre@0.12.0

## 0.11.1

### Patch Changes

- 5582f1a: 依存パッケージ24件を更新します（#190）。

  GraphQL.js 17.1.0、GraphQL Code Generator 7/8、workerd、Electron、SWC、Vitest、CLI・開発ツール、およびウェブサイト関連依存を更新し、最新のバグ修正と互換性改善を取り込みます。公開パッケージの API に意図した変更はありません。

- Updated dependencies [5582f1a]
  - @loutrejs/loutre@0.11.1

## 0.11.0

### Minor Changes

- 7dbd2d6: `@loutrejs/mcp` を追加し、既存の Module と DI から MCP Tool を Streamable HTTP で公開できるようにします。endpoint ごとの OAuth、Tool ごとの scope 認可、呼び出しごとの Context を提供し、同じ HTTP listener 上の複数 endpoint を分離します。

  GraphQL と MCP の endpoint は共通の Execution 委譲を使用します。Core が factory と middleware の依存を Application Model へ集約し、HTTP・WebSocket・Tasks・MessagePort を含む各 Runtime の責務と終了処理を整理します。HTTP の中断 signal を統一し、GraphQL の並行 resolver・Batch・Subscription と MCP Tool の実処理が完了するまで Provider を保持します。

  以下の公開 API に破壊的変更があります。

  - WebSocket の入力検証結果は `kind` で判別します。frame の表現形式は従来どおり `type: 'text' | 'binary'` です。
  - Tasks の宣言 payload は `declaration` 配下へ移動します。
  - MessagePort の実行結果は `kind: 'unary' | 'stream'` を明示します。
  - 独自 Extension は `context.compileHandler()` と `context.collectDependencies()` で依存を登録します。Application Model の依存一覧は常に配列になります。

  HTTP・WebSocket・MessagePort・MCP は契約で宣言した method だけを検証し、prototype 上や非列挙の method も元の receiver を維持して呼び出します。

### Patch Changes

- Updated dependencies [7dbd2d6]
  - @loutrejs/loutre@0.11.0
