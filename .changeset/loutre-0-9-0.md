---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
'@loutrejs/graphql': minor
---

`injectInquirer()`を公開し、独自loggerなどで依存元のProviderやExecutionの構築metadataを取得できるようにしました。metadataは構築情報の保存に使用し、依存宣言の分岐には使用しないでください。

`defineModule({ ... })`で静的Moduleを直接定義できるようにしました。引数なしのModule templateも`imports`や`modules`へ括弧なしで渡せます。同じModuleを共有した際のidentityを維持し、引数付きModuleは従来どおり明示的に生成します。

Node.jsとBunのRuntimeは`create()`時点で終了hookを登録し、HTTPを持たないTask / Queue WorkerもSIGINT / SIGTERMで終了処理できるようにしました。`create({ shutdownHooks: false })`で無効化できます。終了失敗時にも新規受付を停止し、実行中処理のdrainとProvider cleanupの境界を揃えました。signal後にdrainがtimeoutした場合も、Workerの終了処理を継続します。

破壊的変更としてBunの最低要件を1.4.0へ引き上げ、Bun 1.3の対応を終了しました。Bun Adapter、CLI、create-loutreは1.4.0未満での実行を拒否し、生成するBun projectにも`engines.bun: >=1.4.0`を設定します。

canonical Application Modelに宣言されていない依存をRuntimeで解決できていた問題を修正しました。構築metadataやEnv / Argsの値によって依存を追加すると、`LUTRE_DI_UNDECLARED_DEPENDENCY`で失敗します。必要な依存は無条件に宣言し、条件分岐はhandlerなどの実行処理へ移してください。factory Providerの依存は`inject`配列で宣言します。

独自Execution ExtensionのRuntime / Host contextは、`executions`の各要素を`{ execution, resolve }`のbindingとして受け取るように変更しました。`applicationRuntime.resolve()`の代わりに、対象Executionのbindingが持つ`resolve()`を使用してください。

Code scanningの指摘に対応し、CLIのignore globのescapeを修正しました。create-loutreのpackage名の正規化で長いhyphen列による処理時間の増大を防ぎ、GraphQLの検証コードから動的な文字列評価と入力依存の実行先も除きました。

依存packageを更新し、利用ガイドとexampleを新しいModule定義・Worker終了処理・依存宣言の契約へ揃えました。公開6packageは同じ0.9.0でリリースします。
