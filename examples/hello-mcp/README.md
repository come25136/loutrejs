# Hello MCP

OAuth 認証なしで挨拶 Tool を呼び出すサンプルです。サーバーは `http://127.0.0.1:3011/mcp` で待ち受けます。`greet` は `{ name }` を受け取り、挨拶を返します。

リポジトリのルートでサーバーを起動します。

```sh
npm install
npm run build
npm run start --workspace @loutrejs/example-hello-mcp
```

別のターミナルでクライアントを実行すると、Tool 一覧と呼び出し結果が表示されます。

```sh
npm run client --workspace @loutrejs/example-hello-mcp -- Loutre
```

```jsonl
["greet"]
{"message":"Hello, Loutre!"}
```

ポートを変更する場合は、サーバーとクライアントに同じ `PORT` を指定してください。認証付きの例では、トークンの scope を使って Tool ごとにアクセスを制御します。[MCP カウンター](../mcp-counter/README.md)
