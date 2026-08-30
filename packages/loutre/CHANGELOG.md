# @loutrejs/loutre

## 0.4.0

### Minor Changes

- c8968bb: Runtime Application Contextを導入し、初期化済みApplicationから`app.get()`でapplication-scopeのService、Env、Argumentsを型付きで取得できるようにしました。Node.js/Bun/DenoのHost APIを`runtime.create()`からApplication Contextを生成し、`app.serve()`でlistenerを開始する構成へ変更しました。あわせて`doctor`のruntime指定を`--runtime`へ統一し、未指定時は実行中runtimeを自動検出します。

## 0.3.0

### Minor Changes

- 8573a15: Contract APIをprotocol-first compositionへ変更し、Contractの表示名とGraph上のidentityを分離しました。Moduleのexports境界、typed HTTP client、Graph diagnosticsを追加し、examplesを実コマンドで検証するE2E coverageを整備しました。

## 0.2.0

### Minor Changes

- bbbb693: `@loutrejs/loutre/presentation` を追加し、startup表示とshutdown処理をRuntime adapter側へ移しました。Node.js / Bun / Denoでは、port未指定時のみ3000から空きポートを探し、別runtime上での誤利用をエラーにします。`@loutrejs/cli` の旧startup banner APIは削除しました。
