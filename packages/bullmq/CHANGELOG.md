# @loutrejs/bullmq

## 0.7.0

### Minor Changes

- 738df2f: Loutre DevToolsを追加しました。`loutre dev`でローカルのControl PlaneとApplication runtime channelを起動し、Application ModelのGraph、Runtime Trace、Replay、Provider Playgroundを同じsessionから確認できます。

  Applicationは`DevtoolsModule()`を明示的にimportしてTrace captureを有効化します。Runtime instrumentationはHTTP、Task、MessagePort、WebSocket、Provider methodのexecutionをGraph nodeへ対応付け、値のpreview、redaction、Replay capsuleを提供します。

  DevTools UIではGraphの探索、diagnostic、Trace waterfall、Graphとruntimeの相互移動、実行結果とinputの確認を行えます。Application runtimeが未接続の場合は、Trace画面で`DevtoolsModule()`の設定を確認するよう案内します。

### Patch Changes

- Updated dependencies [738df2f]
  - @loutrejs/loutre@0.7.0

## 0.6.0

### Minor Changes

- dfa6c3b: Application Modelを唯一の正本とするExecution Extension architectureへ移行しました。Application Definitionからcompile済みApplication Modelを構築し、Runtime、CLI、Build、Graph projection、OpenAPIが同じModelを参照します。Moduleの実行定義は`executions`へ統一し、Task / Triggerの直接実行はExtension-owned Host APIへ移行します。

  HTTP、Tasks、MessagePort、WebSocketのexecution semanticsは各Extensionが所有します。公開境界は`@loutrejs/loutre/http`、`@loutrejs/loutre/tasks`、`@loutrejs/loutre/message-port`、`@loutrejs/loutre/websocket`へ統一し、protocol固有のnpm packageは増やさずmain packageのsubpathとして配布します。公開npm packageは`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`、`@loutrejs/cli`、`create-loutre`の5つです。

  Application ModelではProvider、Lifecycle、Execution、Runtime Capability、generic Layerのdependency / ownershipをcanonical graphとして管理し、cross-module dependency、Extension identity、Host namespace、owner ambiguityなどをcompile時に検証します。Runtime CapabilityとExecution Extensionのidentityはbundle境界を越えて安定する方式へ統一しました。

  shutdown lifecycleを`drain → active execution 0 → Extension close → Provider cleanup`へ統一し、HTTP / MessagePort / WebSocketの長寿命execution、pending `next()`、`iterator.return()`、forced shutdownを同じownership契約で扱います。Node / Bun / Deno / Cloudflare Workers / Electron / AWS Lambda adapterも新しいKernelへ揃えています。

  HTTPはrequest body decodeと`validate.body`境界、CORS、Basic / Bearer Auth、response headers、streaming / SSE、OpenAPI metadataをExtension側で管理します。CLIは`warning` diagnosticを表示しつつ、`error` diagnosticだけをblockingとして扱います。

  CLIのGraph / Explainでは、Module / Provider / HTTP Controller / Route / Middleware / Handlerの定義元をproject-relativeなSource LocationとしてApplication ModelからGraph IRへ保持し、text / JSON / Mermaidへ出力します。Source metadataはbest-effortかつoptionalで、静的に安全に特定できない場合は推測せず省略します。production buildではsource instrumentationを行いません。

  公開packageは0.xでは同一minorをcompatibility unitとして扱います。`@loutrejs/node` / `@loutrejs/bullmq`は`@loutrejs/loutre`をrequired peer dependencyとして共有し、releaseは5packageを同じminor versionへ揃えます。

### Patch Changes

- Updated dependencies [dfa6c3b]
  - @loutrejs/loutre@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [6375229]
  - @loutrejs/loutre@0.5.0

## 0.4.1

### Patch Changes

- 8666927: `bullmq`のpeer dependencyを`^6.3.0`から`^6.2.0`へ広げ、BullMQ 6.2系でも`@loutrejs/bullmq`を利用できるようにしました。
- @loutrejs/loutre@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [c8968bb]
  - @loutrejs/loutre@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8573a15]
  - @loutrejs/loutre@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [bbbb693]
  - @loutrejs/loutre@0.2.0
