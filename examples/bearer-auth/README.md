# ユーザー定義Bearer認証サンプル

Loutre本体に認証方式を追加せず、公開されている`layer()`、`shortCircuit()`、
`shortCircuits`メタデータだけで`GET /profile`を保護するサンプルです。

リポジトリルートで依存関係をインストールしたあと、次のコマンドで起動します。

```sh
npm run dev --workspace @loutrejs/example-bearer-auth
```

認証せずにアクセスするとHTTP 401を返します。

```sh
curl -i http://127.0.0.1:3002/profile
```

サンプル用tokenを指定するとプロフィールを取得できます。

```sh
curl -i -H 'Authorization: Bearer loutre-token' http://127.0.0.1:3002/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

このtokenは動作確認専用です。実際のアプリケーションでは署名・issuer・audience・期限などを
検証し、tokenや秘密鍵をソースコードへ保存しないでください。

型、Application Graph、動作を検証する場合は次のコマンドを実行します。

```sh
npm run typecheck --workspace @loutrejs/example-bearer-auth
npm run check --workspace @loutrejs/example-bearer-auth
npm test --workspace @loutrejs/example-bearer-auth
```
