# Hello HTTPサンプル

Loutreで最小のHTTP APIを作るサンプルです。path parameterの検証、型付きController、
Providerの依存注入を含みます。

リポジトリルートで依存関係をインストールしたあと、次のコマンドで起動します。

```sh
npm run dev --workspace @loutrefw/example-hello-http
```

別のターミナルからリクエストします。

```sh
curl http://127.0.0.1:3000/greetings/Loutre
```

```json
{"message":"こんにちは、Loutre！"}
```

Application Graphと型だけを検証する場合は、次のコマンドを実行します。

```sh
npm run check --workspace @loutrefw/example-hello-http
npm run typecheck --workspace @loutrefw/example-hello-http
```
