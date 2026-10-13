---
'@loutrejs/loutre': patch
'@loutrejs/node': patch
'@loutrejs/graphql': patch
'@loutrejs/bullmq': patch
'@loutrejs/cli': patch
'create-loutre': patch
---

Node.jsとBunで`serve({ port: 0 })`を使った際、OSが割り当てた実際のportを`listener.port`とReadyログに反映するよう修正しました。

Node.jsとBun上のCLIで、native addonを使うApplicationを`check --entry`で検証できるよう修正しました。依存packageを元の配置から読み込み、native binaryと相対requireの配置を維持します。

GraphQL型生成とCLIのformatterの依存packageを更新しました。
