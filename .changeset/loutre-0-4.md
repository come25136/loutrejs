---
'@loutrejs/loutre': minor
---

Runtime Application Contextを導入し、初期化済みApplicationから`app.get()`でapplication-scopeのService、Env、Argumentsを型付きで取得できるようにしました。Node.js/Bun/DenoのHost APIを`runtime.create()`からApplication Contextを生成し、`app.serve()`でlistenerを開始する構成へ変更しました。あわせて`doctor`のruntime指定を`--runtime`へ統一し、未指定時は実行中runtimeを自動検出します。
