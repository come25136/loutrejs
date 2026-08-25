# Drizzle PostgreSQL Database Example

Drizzle PostgreSQLのnative transaction configを`options.begin`へそのまま渡し、nested
`tx.transaction()`をsavepoint primitiveとして使う例です。

```sh
docker compose -f examples/database-drizzle-postgres/compose.yaml up -d
npm run dev --workspace @loutrejs/example-database-drizzle-postgres
```

```sh
curl -X POST http://127.0.0.1:3002/users \
  -H 'content-type: application/json' \
  -d '{"name":"Loutre"}'
```

Repositoryはrootの`NodePgDatabase`とtransaction callbackのclientを区別せず、
`DrizzleDatabase.client`からambient clientを取得します。
