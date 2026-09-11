---
'@loutrejs/loutre': minor
'@loutrejs/cli': minor
'@loutrejs/websocket': minor
'@loutrejs/tasks': minor
'@loutrejs/message-port': minor
---

Application Modelを唯一の正本とするExecution Extension architectureへ移行します。

CoreはApplication Definition / Model、Module、DI、Lifecycle、active execution lifetime、Runtime Capability、generic Layer、Graph projectionだけを所有します。HTTP、Task、MessagePort、WebSocketのexecution semanticsは各Extensionがcompile / validate / runtime / Host API / Graph projectionを所有します。

HTTPは`@loutrejs/loutre/http`、Task / Trigger / Queue Consumerは`@loutrejs/tasks`、MessagePortは`@loutrejs/message-port`、WebSocketは`@loutrejs/websocket`から提供します。

ModuleはExtensionが生成したExecution Definitionを`executions`へ登録します。Runtime adapter、CLI、build、OpenAPIは同じcompile済みApplication Modelを参照し、並行するApplication representationを持ちません。

Custom Extensionの`compile()`は、元DefinitionからModel semanticsに必要な範囲をsnapshotした`compiled`を返す責務を持ちます。`compiled`はCoreにとってopaqueであり、Coreはclone、freeze、immutability検査を行いません。

HTTP request body decode、validation boundary、CORS、authentication、streaming、response headers、OpenAPI metadataはHTTP Extensionの責務です。Runtime Capability identityはbundle境界を越えて安定するidentityへ統一します。

HTTPとMessagePortのserver-streamはshutdown時に`iterator.return()`が`done: false`を返してもiterator cleanupとExecution完了までdrainします。MessagePortはconsumer向けのAsyncIterator semanticsを維持します。Lifecycle cleanup順序は既存の`onModuleDestroy`、`beforeApplicationShutdown`、`onApplicationShutdown`を維持し、drainの成否にかかわらずactive executionが0になる前にProviderをcleanupせず、待機を`forceShutdownTimeoutMs`で打ち切ります。CLIは`warning` diagnosticを表示しつつ、`error`だけをblockingとして扱います。
