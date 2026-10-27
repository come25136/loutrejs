---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'@loutrejs/graphql': minor
'create-loutre': minor
---

識別子・単位・正規化済みの値とfactory出力にBranded Typesを導入しました。Coreから各Extension、adapter、CLIまで型を保持し、DevToolsの受信時にはmessageの構造も検証します。

TypeScript APIには破壊的変更があります。Modelやinstrumentation metadataを手書きする場合は、domainのparser・factoryと時刻の変換関数で値を確定してください。合成execution IDには`syntheticExecutionId()`を使用します。宣言用のobject literal、Schemaの入出力推論、JSON上の文字列・数値表現は維持しています。

HTTP handlerのdirect replayでは、入力の`params`がobjectであることを検証し、不正な値はhandlerを呼ぶ前に拒否します。
