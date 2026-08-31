# Hello HTTPサンプル

Loutreで最小のHTTP APIを作るサンプルです。ContractとControllerだけで、root endpointから固定レスポンスを返します。

リポジトリルートで依存関係をインストールしたあと、次のコマンドで起動します。

```sh
npm run dev --workspace @loutrejs/example-hello-http
```

別のターミナルからリクエストします。

```sh
curl http://127.0.0.1:3000/
```

```json
{ "message": "Hello from Loutre!" }
```

Application Graphと型だけを検証する場合は、次のコマンドを実行します。

```sh
npm run check --workspace @loutrejs/example-hello-http
npm run typecheck --workspace @loutrejs/example-hello-http
```
