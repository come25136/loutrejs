# Drizzle PostgreSQL Database Example

Drizzle PostgreSQLのnative transaction clientとtransaction configを型を変えずにtyped
Contextへ渡すサンプルです。

```sh
npm run db:start --workspace @loutrejs/example-database-drizzle-postgres
npm run dev --workspace @loutrejs/example-database-drizzle-postgres
```

```sh
curl --request POST http://127.0.0.1:3002/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`DrizzleTransaction`と`DrizzleTransactionOptions`は`NodePgDatabase.transaction()`から
推論しています。`transaction([http.controller])`のchild Pipeline内だけでtransaction
clientを利用でき、Repositoryへ明示的に渡します。`any`やunsafe castは使用しません。
