# Drizzle PostgreSQL Database Example

Pass Drizzle PostgreSQL's native transaction client and transaction configuration through typed Context without changing their types.

From this example directory, start PostgreSQL and the application with:

```sh
npm run db:start
npm run dev
```

Create a user:

```sh
curl --request POST http://127.0.0.1:3002/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`DrizzleTransaction` and `DrizzleTransactionOptions` are inferred from `NodePgDatabase.transaction()`. The transaction client is available only inside the child Pipeline created by `transaction([http.controller])` and is passed explicitly to the Repository. The example does not use `any` or unsafe casts.
