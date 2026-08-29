# @loutrejs/loutre

## 0.2.0

### Minor Changes

- bbbb693: `@loutrejs/loutre/presentation` を追加し、startup表示とshutdown処理をRuntime adapter側へ移しました。Node.js / Bun / Denoでは、port未指定時のみ3000から空きポートを探し、別runtime上での誤利用をエラーにします。`@loutrejs/cli` の旧startup banner APIは削除しました。
