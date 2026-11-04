---
'@loutrejs/loutre': patch
'@loutrejs/node': patch
'@loutrejs/bullmq': patch
'@loutrejs/cli': patch
'create-loutre': patch
'@loutrejs/graphql': patch
---

GraphQL CLIのclient targetで、operationが参照する入力型とenumを一度だけ生成します。入れ子の入力型を変数に使ったときに起こる型定義の衝突を解消します。
