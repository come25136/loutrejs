---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
---

Loutre DevToolsを追加しました。`loutre dev`でローカルのControl PlaneとApplication runtime channelを起動し、Application ModelのGraph、Runtime Trace、Replay、Provider Playgroundを同じsessionから確認できます。

Applicationは`DevtoolsModule()`を明示的にimportしてTrace captureを有効化します。Runtime instrumentationはHTTP、Task、MessagePort、WebSocket、Provider methodのexecutionをGraph nodeへ対応付け、値のpreview、redaction、Replay capsuleを提供します。

DevTools UIではGraphの探索、diagnostic、Trace waterfall、Graphとruntimeの相互移動、実行結果とinputの確認を行えます。Application runtimeが未接続の場合は、Trace画面で`DevtoolsModule()`の設定を確認するよう案内します。
