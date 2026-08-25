# PostgreSQL Database Example

`pg`の`Pool`と`PoolClient`をApplication側で管理し、`PoolClient`をtransaction Layerから
Controllerへ渡す最小構成です。

```sh
npm run db:start --workspace @loutrejs/example-database-postgres
npm run dev --workspace @loutrejs/example-database-postgres
```

```sh
curl --request POST http://127.0.0.1:3001/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`PostgresDatabase`は同期constructionでPoolを組み立て、`onModuleInit()`で接続確認、
`onModuleDestroy()`で解放します。BEGIN、COMMIT、ROLLBACKはApplication側のtransaction
callbackに閉じ込め、Loutreは`pg`を認識しません。
