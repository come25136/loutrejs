# PostgreSQL Database Example

Manage `pg`'s `Pool` and `PoolClient` in the Application and pass the `PoolClient` from a transaction Layer to the Controller.

From this example directory, start PostgreSQL and the application with:

```sh
npm run db:start
npm run dev
```

Create a user:

```sh
curl --request POST http://127.0.0.1:3001/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`PostgresDatabase` creates the Pool synchronously, verifies the connection in `onModuleInit()`, and releases it in `onModuleDestroy()`. `BEGIN`, `COMMIT`, and `ROLLBACK` stay inside the Application-defined transaction callback, so Loutre does not need to know anything about `pg`.
