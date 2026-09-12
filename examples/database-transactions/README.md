# Database Transactions Example

Demonstrate Application-defined transactions, a custom TokenLike, typed HTTP middleware state, and database-independent transaction boundaries without an external database.

From this example directory, start the application with:

```sh
npm run dev
```

Create a user:

```sh
curl --request POST http://127.0.0.1:3000/users \
  --header 'content-type: application/json' \
  --data '{"name":"Loutre"}'
```

`DATABASE` is a custom token. The transaction Layer injects `InMemoryDatabase` from that token, opens a transaction, and contributes the transaction client with `next({ transaction: client })`. Routes include that Layer in `middlewares`, so Controllers receive the client through typed `ctx.state.transaction` and pass it to their Repository.

To inspect the Application Graph, run:

```sh
npm run graph
```
