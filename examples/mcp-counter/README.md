# MCP カウンター

HTTP Contract の `/mcp` ルートから Streamable HTTP でカウンターを公開するサンプルです。endpoint の factory が `inject(CounterService)` で受け取ったカウンターを、`counter.get` と `counter.increment` の handler で共有します。接続には `counter:read`、加算には追加で `counter:write` が必要です。

リポジトリのルートで依存関係をインストールし、サーバーを起動します。

```sh
npm install
npm run build
npm run start --workspace @loutrejs/example-mcp-counter
```

別のターミナルで MCP クライアントを実行します。既定の読み取り用トークンでは、一覧に `counter.get` だけが表示されます。

```sh
npm run client --workspace @loutrejs/example-mcp-counter
npm run client --workspace @loutrejs/example-mcp-counter -- counter.get
```

同じトークンで `counter.increment` を直接呼ぶと、`403 insufficient_scope` が返ります。書き込み用トークンに切り替えると加算できます。

```sh
npm run client --workspace @loutrejs/example-mcp-counter -- counter.increment '{"by":2}'
MCP_TOKEN=demo-write npm run client --workspace @loutrejs/example-mcp-counter -- counter.increment '{"by":2}'
npm run client --workspace @loutrejs/example-mcp-counter -- counter.get
```

最後の読み取り結果は `{"value":2}` です。サーバーとクライアントは既定で `http://127.0.0.1:3010/mcp` を使います。ポートを変更する場合は両方に同じ `PORT` を指定します。

サンプルはローカル接続用の固定トークンでリソースサーバーの認可を再現します。実際の認可サーバーと接続する場合は、HTTPS の公開 URL を使い、`verifyAccessToken` で署名またはイントロスペクションの結果を検証します。 [MCP パッケージの設定](../../packages/mcp/README.md)
