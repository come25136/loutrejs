# Database Transactions Example

外部DBなしでApplication定義のtransaction、custom TokenLike、typed Context、再帰Pipelineを
確認するサンプルです。

```sh
npm run dev --workspace @loutrejs/example-database-transactions
```

```sh
curl --request POST http://127.0.0.1:3000/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`DATABASE`はcustom tokenです。transaction Layerはそのtokenから`InMemoryDatabase`をfactory
DIし、`transaction([authorization, http.controller])`のchild Pipelineにtransaction clientを
渡します。Controllerが呼ぶRepositoryはtyped Contextのclientを明示的に受け取ります。

```sh
npm run graph --workspace @loutrejs/example-database-transactions
```
