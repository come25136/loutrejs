# PostgreSQL Database Example

`pg`の`Pool` / `PoolClient`をLoutreのroot client / transaction clientへ対応させる最小adapter例です。

```sh
docker compose -f examples/database-postgres/compose.yaml up -d
npm run dev --workspace @loutrejs/example-database-postgres
```

```sh
curl -X POST http://127.0.0.1:3001/users \
  -H 'content-type: application/json' \
  -d '{"name":"Loutre"}'
```

`PostgresDatabase`のconstructorは設定のDIだけを行います。接続は`connect()`、解放は
`disconnect()`、BEGIN/COMMIT/ROLLBACKとSAVEPOINTはphysical primitiveへ閉じ込めています。
