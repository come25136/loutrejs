# Prisma PostgreSQL Database Example

Use Prisma 7's generated client and interactive `$transaction()` directly from a recursive Pipeline.

From this example directory, generate the Prisma client, start PostgreSQL, and start the application with:

```sh
npm run generate
npm run db:start
npm run dev
```

Create a user:

```sh
curl --request POST http://127.0.0.1:3003/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`Prisma.TransactionClient` is stored under the `TRANSACTION` Context Field and passed explicitly from the Controller to the Repository. Transaction options are inferred from the generated client's `$transaction()` method, preserving Prisma-specific options such as `isolationLevel`, `maxWait`, and `timeout`. The transaction client is never cast to the root `PrismaClient`, and the example does not use nested `$transaction()` calls that are absent from Prisma's transaction client type.
