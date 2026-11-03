---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
'@loutrejs/graphql': minor
---

ApplicationのLoggerをDIへ統合し、HTTP ContractからGraphQL HTTP / WebSocketを公開できるようにしました。Modelや実行時metadataなどにはBranded Typesを導入しています。公開APIに互換性変更を含むため、公開6packageを0.10.0へ揃えます。

### Loggerと終了処理

- 組み込み実装を`LoggerService`、注入先を予約tokenの`LoggerToken`として公開しました。標準のconsole出力は登録なしで利用でき、標準構成を明示する`LoggerModule`も提供します。ProviderやExecutionでは`inject(LoggerToken)`、起動コードでは`app.get(LoggerToken)`を使用します。
- カスタムLoggerは`provide(LoggerToken).useClass(CustomLoggerService)`で登録し、Application直下Moduleの`exports`から`LoggerToken`を公開します。backendも通常のProviderとしてEnvironmentやほかのサービスを注入でき、Loggerと依存の構築・初期化・終了をApplicationが管理します。
- **移行が必要:** `defineApplication({ logger: ... })`、Runtime起動時のLogger override、`Container`のLogger optionを廃止しました。ModuleのProvider登録へ移してください。`child()`も廃止し、DIで要求元の`source`を自動付与します。旧名`Logger`のexportも削除しました。生成・継承・型注釈は`LoggerService`、`inject()`や`app.get()`での取得は`LoggerToken`へ置き換えてください。
- ModuleとProviderに`onApplicationDispose`を追加しました。終了中にも必要なbackendのflush・closeはこのhookへ置きます。既存のshutdown hookの後に実行し、初期化失敗時にも生成済みの依存を回収します。同じ実体を別tokenで公開した場合のlifecycle重複実行も防ぎます。
- 終了済みLoggerへの出力はconsoleへ送り、閉じたbackendを再利用しません。signal終了失敗の診断では非同期Loggerの失敗も捕捉します。Errorの独自propertyと`AggregateError.errors`を含むシリアライズも改善しました。

利用方法は[ApplicationのLogger](https://github.com/come25136/loutrejs/blob/main/docs/ja/architecture.md#applicationのlogger)を参照してください。

### Moduleの登録

- **移行が必要:** 引数なしModule templateを`modules`や`imports`へ直接渡す暗黙生成を廃止しました。静的Moduleは`defineModule({ ... })`で定義し、factoryは呼び出してからinstanceを登録してください。同じinstanceの参照は共有し、factoryを明示的に呼ぶたびに別instanceを生成します。
- 互換用の`ModuleInput`型と`asModuleInstance()`も削除しました。登録対象の型には`ModuleInstance`を使用してください。未生成templateは型チェックとModel構築時に拒否します。詳細は[Moduleの定義ガイド](https://github.com/come25136/loutrejs/blob/main/docs/ja/getting-started.md)を参照してください。

### HTTP ContractとGraphQL

- HTTP Contractの`raw: true`ルートから`graphql.implementation({ route, manifest, transports, factory })`へ処理を委任できるようにしました。公開path・method・middlewareはHTTP Contractへ集約し、HTTPとWebSocket Upgradeで同じmiddlewareを適用します。
- **移行が必要:** `graphql.endpoint` / `defineGraphQLEndpoint`を廃止しました。HTTP Contractから取得したrawルートを`graphql.implementation`へ渡してください。対応する公開型も`GraphQLImplementation` / `GraphQLImplementationDefinition`へ変更しています。transportは`transports: { http: true, websocket: true }`で有効化し、DIを使うWebSocketの接続hookは`factory`が返す`ws`へ置きます。HTTPは既定で有効、WebSocketは既定で無効です。
- **移行が必要:** GraphQL.js 16への対応を終了し、peer dependencyを`^17.0.0`へ変更しました。GraphQL.jsは17系を使用してください。Scalarは`coerceOutputValue`・`coerceInputValue`・`coerceInputLiteral`へ揃え、Subscriptionの実行とdefault値のcoercionも17のAPIへ統一しています。
- ConnectionInitの戻り値を接続stateとして推論し、各operationへ渡します。`ConnectionRejected`を返すとclose code 4403で拒否でき、接続stateをACK payloadへ公開しません。middlewareは`http.isWebSocketUpgrade(request)`で認証をConnectionInitへ延期できます。
- 認証拒否・例外・切断時に購読とoperationの資源を回収し、Upgrade前の拒否応答のstatus・headers・bodyを保持します。通常HTTP入口ではUpgrade要求を400で拒否し、WebSocket入口はGETのみ受け付けます。
- Auth exampleを追加し、Counter・OrdersとともにHTTP Contract、GraphQL実装、生成物の配置を揃えました。移行例は[GraphQL packageの利用ガイド](https://github.com/come25136/loutrejs/blob/main/packages/graphql/README.md)を参照してください。

### Branded Typesと開発環境

- CoreからHTTP・WebSocket・MessagePort・Tasks・GraphQL・BullMQ、DevTools、CLIまで、用途の異なるID・symbol・時間・サイズ・source位置を型で区別します。受信データはoptional fieldも含めて検証し、独自Extensionのoperation kindも扱えるようにしました。
- **移行が必要:** Modelやinstrumentation metadataを手書きする場合は、domainのparser・factory・単位変換関数で値を構築してください。合成execution IDには`syntheticExecutionId()`を使用します。宣言用object literal、Schemaの入出力推論、JSON上の文字列・数値表現は維持します。詳細は[Branded Typesの移行案内](https://github.com/come25136/loutrejs/blob/main/docs/adr/loutre_branded_types_adoption.md#互換性と移行)を参照してください。
- HTTP handlerのdirect replayでは、不正な`params`をhandler呼び出し前に拒否します。CLIのsource位置処理とDevToolsの通信・表示にも型と検証を適用しました。
- CLIの`@swc/core`を`^1.16.20`、`oxfmt`を`^0.74.0`へ更新しました。開発・example・websiteの依存も更新し、Electronの検証対象を43・44・45へ揃えています。CLIの既存のNode.js要件を維持するため、Chokidarは5系を継続します。
- 公式websiteのcanonical・hreflang・サイトマップ、アクセス解析と試用への導線を整備しました。通常閲覧時のGA4デバッグ指定を修正し、日本語のGraphQL N+1問題ガイドも拡充しています。
