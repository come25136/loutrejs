# Prisma PostgreSQL Database Example

Prisma 7のgenerated clientとinteractive `$transaction()`を、新しい再帰Pipelineから直接
利用するサンプルです。

```sh
npm run generate --workspace @loutrejs/example-database-prisma-postgres
npm run db:start --workspace @loutrejs/example-database-prisma-postgres
npm run dev --workspace @loutrejs/example-database-prisma-postgres
```

```sh
curl --request POST http://127.0.0.1:3003/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`Prisma.TransactionClient`を`TRANSACTION` Context Keyへ保持し、ControllerからRepositoryへ
明示的に渡します。transaction optionもgenerated clientの`$transaction()`から推論し、Prisma
固有の`isolationLevel`、`maxWait`、`timeout`をそのまま利用します。transaction clientをroot
`PrismaClient`へcastせず、Prismaの型にないnested `$transaction()`も使用しません。
