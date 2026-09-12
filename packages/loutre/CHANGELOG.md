# @loutrejs/loutre

## 0.6.0

### Minor Changes

- bd26b28: Application Modelを唯一の正本とするExecution Extension architectureへ移行します。

  CoreはApplication Definition / Model、Module、DI、Lifecycle、active execution lifetime、Runtime Capability、generic Layer、Graph projectionだけを所有します。HTTP、Task、MessagePort、WebSocketのexecution semanticsは各Extensionがcompile / validate / runtime / Host API / Graph projectionを所有します。

  HTTPは`@loutrejs/loutre/http`、Task / Trigger / Queue Consumerは`@loutrejs/loutre/tasks`、MessagePortは`@loutrejs/loutre/message-port`、WebSocketは`@loutrejs/loutre/websocket`から提供します。4つのExecution Extensionはsource moduleとして分離し、npmではmain packageのsubpathとして配布します。

  ModuleはExtensionが生成したExecution Definitionを`executions`へ登録します。Runtime adapter、CLI、build、OpenAPIは同じcompile済みApplication Modelを参照し、並行するApplication representationを持ちません。

  Custom Extensionの`compile()`は、元DefinitionからModel semanticsに必要な範囲をsnapshotした`compiled`を返す責務を持ちます。`compiled`はCoreにとってopaqueであり、Coreはclone、freeze、immutability検査を行いません。

  HTTP request body decode、validation boundary、CORS、authentication、streaming、response headers、OpenAPI metadataはHTTP Extensionの責務です。Runtime Capability identityはbundle境界を越えて安定するidentityへ統一します。

  HTTPとMessagePortのserver-streamはshutdown時に`iterator.return()`が`done: false`を返してもiterator cleanupとExecution完了までdrainします。MessagePortはconsumer向けのAsyncIterator semanticsを維持します。Lifecycle cleanup順序は既存の`onModuleDestroy`、`beforeApplicationShutdown`、`onApplicationShutdown`を維持し、drainの成否にかかわらずactive executionが0になる前にProviderをcleanupせず、待機を`forceShutdownTimeoutMs`で打ち切ります。CLIは`warning` diagnosticを表示しつつ、`error`だけをblockingとして扱います。

## 0.5.0

### Minor Changes

- 6375229: HTTP Contractをネストして構成できるようにしました。親routeのpath・pipeline・responsesを子Contractへ継承し、`AppContract.http.api.me.profile`のように解決済みContract nodeを型安全に参照してImplementationへ割り当てられます。あわせて不正なContract compositionを型レベルで検出するようにしました。

  ApplicationのContract rootはImplementationから推論するようにし、`defineApplication`への`contract`指定を不要にしました。create-loutreのテンプレートも新しいApplication定義へ更新しています。

  CLIでbundleされたLoutreとアプリケーション側LoutreのContract identityを共有し、bundle境界をまたぐContract判定が正しく動作するようにしました。

## 0.4.1

## 0.4.0

### Minor Changes

- c8968bb: Runtime Application Contextを導入し、初期化済みApplicationから`app.get()`でapplication-scopeのService、Env、Argumentsを型付きで取得できるようにしました。Node.js/Bun/DenoのHost APIを`runtime.create()`からApplication Contextを生成し、`app.serve()`でlistenerを開始する構成へ変更しました。あわせて`doctor`のruntime指定を`--runtime`へ統一し、未指定時は実行中runtimeを自動検出します。

## 0.3.0

### Minor Changes

- 8573a15: Contract APIをprotocol-first compositionへ変更し、Contractの表示名とGraph上のidentityを分離しました。Moduleのexports境界、typed HTTP client、Graph diagnosticsを追加し、examplesを実コマンドで検証するE2E coverageを整備しました。

## 0.2.0

### Minor Changes

- bbbb693: `@loutrejs/loutre/presentation` を追加し、startup表示とshutdown処理をRuntime adapter側へ移しました。Node.js / Bun / Denoでは、port未指定時のみ3000から空きポートを探し、別runtime上での誤利用をエラーにします。`@loutrejs/cli` の旧startup banner APIは削除しました。
