# Database Transactions Example

外部DBなしで`DatabaseService`、custom token、recursive transaction Layer、savepoint、
Repositoryからのambient client参照を試せる例です。

```sh
npm run dev --workspace @loutrejs/example-database-transactions
```

別terminalから利用者を作成します。

```sh
curl -X POST http://127.0.0.1:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Loutre"}'
```

Graphではroot transactionとnested savepointを再帰表示します。

```sh
npm run graph --workspace @loutrejs/example-database-transactions
```

Controllerが呼ぶ`UserRepository`はtransaction clientを引数で受け取りません。
`database.client`が現在のtransaction clientを返します。
