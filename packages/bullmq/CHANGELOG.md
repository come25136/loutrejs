# @loutrejs/bullmq

## 0.8.1

### Patch Changes

- CLIのSWC依存を`^1.16.13`へ更新しました。Bun 1.3.14の依存インストール時に共有cacheが権限`777`で作られる問題に対し、CIではSWC専用の権限`700`のcacheを指定します。Bun 1.3 / 1.4のCLI、GraphQL型生成、HTTP / WebSocketと公開packageの利用を検証しています。
- Updated dependencies
  - @loutrejs/loutre@0.8.1

## 0.8.0

### Minor Changes

- a86ac3c: GraphQLのHTTP / WebSocket transportとSubscriptionに対応する`@loutrejs/graphql`を追加しました。SDLを契約として共有し、CLIでResolver型・Static Schema・型付きBindingを生成できます。Domain Mapper、Scalarのinput / output型、Enumの内部値に対応し、手書きResolverとApplication Contextを型付きで接続できます。

  Resolverは`resolve({ parent, args, context, info })`、Subscriptionは同じobject引数の`subscribe` / `resolve`を使います。関連Fieldの`load({ parents, args, context, signal, selection })`でBatch取得を行い、先読み値の再利用、認可、個別Error、Operation / Mutation root / Subscription event単位のScopeと中断を扱えます。任意の`formatError`でHTTP / WebSocket共通のエラー公開方針を設定できます。Helperと型は`@loutrejs/graphql`からimportします。

  CLIのOpenAPI生成がcontract-first entryに対応しました。Applicationを実行せずにHTTP Contractを共有でき、routeの重複検証とmethodの正規化を共通化しました。HTTP Contractの同一性を検証し、定義後のroute変更がtoolingへ影響しないようにしました。

  破壊的変更としてDeno対応を削除しました。`@loutrejs/loutre/runtime/deno`とDenoのRuntime identity、CLI host / deployment target、create-loutreのtarget / package managerを削除しています。対応RuntimeはNode.js、Bun、Cloudflare Workers、AWS Lambda、Electronです。

  Node / Bun / Cloudflare WorkersのWebSocket実行を整備しました。依存packageを更新し、公開tarballのconsumer、GraphQL.js 16 / 17、server examplesのQuery / Mutation / SubscriptionとBatch取得を検証しています。

  GraphQLのserver生成物は`types.ts`・`schema-ast.ts`・`bindings.ts`です。`bindManifest<AppContext>({ schemaDocument, resolvers })`で手書きResolverを接続し、`graphql.endpoint({ manifest, factory })`で公開します。Clientの型とTypedDocumentNodeは明示的なclient targetで生成します。

### Patch Changes

- Updated dependencies [a86ac3c]
  - @loutrejs/loutre@0.8.0

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
