# Basic認証サンプル

HTTP Basic認証で`GET /profile`を保護するサンプルです。`basicAuth()` Layer、Context Key、
認証失敗時のshort circuitと`WWW-Authenticate` challengeを含みます。

リポジトリルートで依存関係をインストールしたあと、次のコマンドで起動します。

```sh
npm run dev --workspace @loutrejs/example-basic-auth
```

認証せずにアクセスするとHTTP 401を返します。

```sh
curl -i http://127.0.0.1:3001/profile
```

ブラウザで`http://127.0.0.1:3001/profile`へ直接移動した場合は、Basic認証ダイアログが
表示されます。

サンプル用の資格情報`loutre:otter`を指定するとプロフィールを取得できます。

```sh
curl -i -u loutre:otter http://127.0.0.1:3001/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

この資格情報は動作確認専用です。実際のアプリケーションでは、平文の固定パスワードを
ソースコードへ保存せず、秘密情報ストアと安全なパスワード検証を使用してください。

Application Graph、型、動作を検証する場合は次のコマンドを実行します。

```sh
npm run check --workspace @loutrejs/example-basic-auth
npm run typecheck --workspace @loutrejs/example-basic-auth
npm test --workspace @loutrejs/example-basic-auth
```
