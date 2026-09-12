# Drizzle PostgreSQL Database Example

Pass Drizzle PostgreSQL's native transaction client and transaction configuration through typed HTTP middleware state without changing their types.

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

`DrizzleTransaction` and `DrizzleTransactionOptions` are inferred from `NodePgDatabase.transaction()`. The transaction Layer contributes the native Drizzle transaction client with `next(...)`, and routes opt into that Layer through `middlewares`. The Controller receives the client through typed `ctx.state` and passes it explicitly to the Repository. The example does not use `any` or unsafe casts.
