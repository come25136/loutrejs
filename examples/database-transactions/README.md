# Database Transactions Example

Demonstrate Application-defined transactions, a custom TokenLike, typed Context, and recursive Pipelines without an external database.

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

`DATABASE` is a custom token. The transaction Layer injects `InMemoryDatabase` from that token and passes the transaction client into the child Pipeline created by `transaction([authorization, http.controller])`. The Repository called by the Controller receives the client explicitly from typed Context.

To inspect the Application Graph, run:

```sh
npm run graph
```
