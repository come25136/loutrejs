---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
---

Application Modelを唯一の正本とするExecution Extension architectureへ移行しました。Application Definitionからcompile済みApplication Modelを構築し、Runtime、CLI、Build、Graph projection、OpenAPIが同じModelを参照します。Moduleの実行定義は`executions`へ統一し、Task / Triggerの直接実行はExtension-owned Host APIへ移行します。

HTTP、Tasks、MessagePort、WebSocketのexecution semanticsは各Extensionが所有します。公開境界は`@loutrejs/loutre/http`、`@loutrejs/loutre/tasks`、`@loutrejs/loutre/message-port`、`@loutrejs/loutre/websocket`へ統一し、protocol固有のnpm packageは増やさずmain packageのsubpathとして配布します。公開npm packageは`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`、`@loutrejs/cli`、`create-loutre`の5つです。

Application ModelではProvider、Lifecycle、Execution、Runtime Capability、generic Layerのdependency / ownershipをcanonical graphとして管理し、cross-module dependency、Extension identity、Host namespace、owner ambiguityなどをcompile時に検証します。Runtime CapabilityとExecution Extensionのidentityはbundle境界を越えて安定する方式へ統一しました。

shutdown lifecycleを`drain → active execution 0 → Extension close → Provider cleanup`へ統一し、HTTP / MessagePort / WebSocketの長寿命execution、pending `next()`、`iterator.return()`、forced shutdownを同じownership契約で扱います。Node / Bun / Deno / Cloudflare Workers / Electron / AWS Lambda adapterも新しいKernelへ揃えています。

HTTPはrequest body decodeと`validate.body`境界、CORS、Basic / Bearer Auth、response headers、streaming / SSE、OpenAPI metadataをExtension側で管理します。CLIは`warning` diagnosticを表示しつつ、`error` diagnosticだけをblockingとして扱います。

公開packageは0.xでは同一minorをcompatibility unitとして扱います。`@loutrejs/node` / `@loutrejs/bullmq`は`@loutrejs/loutre`をrequired peer dependencyとして共有し、releaseは5packageを同じminor versionへ揃えます。
