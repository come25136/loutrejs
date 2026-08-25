# Prisma PostgreSQL Database Example

Prisma 7.9のgenerated clientを使い、interactive `$transaction()`とnested `$transaction()`を
LoutreのBEGIN / SAVEPOINT primitiveへ対応させる例です。

```sh
docker compose -f examples/database-prisma-postgres/compose.yaml up -d
npm run dev --workspace @loutrejs/example-database-prisma-postgres
```

```sh
curl -X POST http://127.0.0.1:3003/users \
  -H 'content-type: application/json' \
  -d '{"name":"Loutre"}'
```

`options.begin`にはPrisma固有の`isolationLevel`、`maxWait`、`timeout`をそのまま指定します。
generated transaction clientをroot `PrismaClient`へcastしていません。
