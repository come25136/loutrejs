# @loutrejs/cli

## 0.10.0

### Minor Changes

- 62de76f: 0.10.0ではロガーをDIで管理できるようにし、GraphQLの公開先をHTTP Contractで定義する方式に変更しました。IDや時刻などの取り違えを防ぐため、Branded Typesも導入しています。互換性のないAPI変更を含み、公開6パッケージを同じバージョンでリリースします。

  ### Loggerと終了処理
  - 組み込みロガーを`LoggerService`、注入先を予約トークンの`LoggerToken`として公開しました。設定を省略するとconsoleへ出力します。標準構成を明示する`LoggerModule`も提供します。プロバイダーやExecutionでは`inject(LoggerToken)`、起動コードでは`app.get(LoggerToken)`で取得します。
  - 独自のロガーは`provide(LoggerToken).useClass(CustomLoggerService)`で登録し、アプリケーション直下のモジュールの`exports`に`LoggerToken`を指定します。出力先のバックエンドも通常のプロバイダーとして登録でき、環境設定やほかのサービスを注入できます。ロガーとその依存先の生成・初期化・終了はアプリケーションが管理します。
  - `defineApplication({ logger: ... })`、Runtime起動時のロガー差し替え、`Container`のロガー設定を廃止しました。モジュールのプロバイダー登録へ移してください。`child()`も削除し、ログの`source`はDIで要求元に合わせて自動で付けるようにしました。旧名`Logger`のexportも削除しています。生成・継承・型注釈には`LoggerService`、`inject()`や`app.get()`には`LoggerToken`を使ってください。
  - モジュールとプロバイダーに`onApplicationDispose`を追加しました。終了中も使うバックエンドのflushやcloseはこのフックに定義します。既存の終了フックが終わった後に実行され、初期化に失敗した場合も生成済みの依存先を解放します。同じインスタンスを複数のトークンで公開しても、ライフサイクル処理は重複して実行しません。
  - 終了済みのロガーへの出力はconsoleへ送り、閉じたバックエンドを再利用しないようにしました。シグナルによる終了処理に失敗した際は、診断ログの非同期出力が失敗した場合も捕捉します。Errorのシリアライズでは独自プロパティと`AggregateError.errors`も出力するようにしました。

  利用例は[ApplicationのLogger](https://github.com/come25136/loutrejs/blob/main/docs/ja/architecture.md#applicationのlogger)を参照してください。

  ### Moduleの登録
  - `modules`と`imports`にはモジュールのインスタンスを登録する形に統一しました。設定が不要なら`defineModule({ ... })`の戻り値を、設定が必要ならファクトリーに引数を渡して呼び出した戻り値を登録します。静的なモジュールは定義時にインスタンス化されるため、そのまま渡せます。
  - 引数なしファクトリーをそのまま登録すると自動で呼び出す省略記法と、`ModuleInput`型・`asModuleInstance()`を削除しました。

  ### HTTP ContractとGraphQL
  - HTTP Contractに`raw: true`のルートを定義し、`graphql.implementation({ route, manifest, transports, factory })`へ渡してGraphQLを公開できるようにしました。公開パス・HTTPメソッド・ミドルウェアはHTTP Contractに記述します。同じミドルウェアを通常のHTTP要求とWebSocket Upgradeの両方に適用します。
  - `graphql.endpoint`と`defineGraphQLEndpoint`を削除しました。HTTP Contractのrawルートを`graphql.implementation`へ渡す形に書き換えてください。公開型も`GraphQLImplementation`と`GraphQLImplementationDefinition`へ変更しています。両方の通信方式を有効にするには`transports: { http: true, websocket: true }`を指定します。DIを使うWebSocketの接続フックは`factory`が返す`ws`に定義します。既定ではHTTPが有効、WebSocketが無効です。
  - GraphQL.js 16のサポートを終了し、peer dependencyを`^17.0.0`に変更しました。GraphQL.jsは17系を使ってください。Scalarの定義には`coerceOutputValue`・`coerceInputValue`・`coerceInputLiteral`を使います。Subscriptionの実行とデフォルト値の型変換も17のAPIに統一しました。
  - ConnectionInitの戻り値から接続状態の型を推論し、各操作へ渡すようにしました。`ConnectionRejected`を返すとclose code 4403で接続を拒否でき、接続状態をACKのペイロードへ公開しません。ミドルウェアでは`http.isWebSocketUpgrade(request)`で認証をConnectionInitまで延期できます。
  - 認証拒否・例外・切断時に購読と操作のリソースを解放するようにしました。Upgrade前に拒否した場合も、応答のステータス・ヘッダー・本文を保持します。通常のHTTP処理ではUpgrade要求を400で拒否し、WebSocketへの接続はGETだけを受け付けます。
  - 認証を扱うAuthサンプルを追加しました。Counter・Ordersも含め、HTTP Contract、GraphQL実装、生成コードの配置を揃えています。移行例は[GraphQLの利用ガイド](https://github.com/come25136/loutrejs/blob/main/packages/graphql/README.md)を参照してください。

  ### Branded Typesと開発環境
  - CoreからHTTP・WebSocket・MessagePort・Tasks・GraphQL・BullMQ、DevTools、CLIまでBranded Typesを導入しました。用途の異なるID・シンボル・時間・サイズ・ソース位置を型で区別します。受信データは省略可能なフィールドも含めて検証し、独自Extensionの操作種別も扱えるようにしました。
  - モデルや計測用メタデータを手書きしている場合は、各データのパーサー・ファクトリー・単位変換関数を使って値を作ってください。合成したexecution IDには`syntheticExecutionId()`を使います。宣言用のオブジェクトリテラル、Schemaの入出力の型推論、JSON上の文字列・数値表現は変わりません。詳細は[Branded Typesの移行案内](https://github.com/come25136/loutrejs/blob/main/docs/adr/loutre_branded_types_adoption.md#互換性と移行)を参照してください。
  - HTTPハンドラーを直接リプレイする際、不正な`params`をハンドラーの呼び出し前に拒否するようにしました。CLIのソース位置処理とDevToolsの通信・表示にも型と検証を適用しています。
  - CLIの`@swc/core`を`^1.16.20`、`oxfmt`を`^0.74.0`へ更新しました。開発環境・サンプル・公式サイトの依存パッケージも更新し、Electronの検証対象を43・44・45に揃えています。CLIのNode.js要件を維持するため、Chokidarは5系を継続します。
  - 公式サイトのcanonical・hreflang・サイトマップを整備し、試用までの導線とアクセス解析を見直しました。通常閲覧時にGA4へ送っていたデバッグ指定を修正し、日本語のGraphQL N+1問題ガイドも拡充しています。

### Patch Changes

- Updated dependencies [62de76f]
  - @loutrejs/loutre@0.10.0

## 0.9.2

### Patch Changes

- 76742bd: 依存packageの更新を取り込み、GraphQLの`graphql-ws`を`^6.4.1`へ更新しました。開発・テスト環境とサンプルの依存packageも更新し、GraphQL Ordersサンプルの未使用クライアント依存を削除しています。

  公式websiteのGraphQL・Batch処理の説明とコード比較を拡充し、SDL連携・型生成・N+1対策のガイドを追加しました。Domain Mapper・Scalar・エラー整形・認可・Batch Scopeなどの詳細仕様も日本語ガイドで読めます。websiteの依存packageに対するセキュリティ更新と、表示・リンク・アクセシビリティの修正も含みます。公開6packageは同じ0.9.2でリリースします。

  公開前のセキュリティ監査に対応し、開発・websiteで使うDOMPurifyを3.4.17、Electronを44.9.3、fast-uriを3.1.9、undiciを7.30.1、postcss-selector-parserを7.1.7へ更新しました。ElectronのCIも42・43・44の各系列で修正済みのversionへ揃えました。

- Updated dependencies [76742bd]
  - @loutrejs/loutre@0.9.2

## 0.9.1

### Patch Changes

- 70d4d69: Dependabotによる依存packageの更新を取り込みました。CLIの`@swc/core`を`^1.16.18`、`@graphql-codegen/typed-document-node`を`^7.2.0`、`oxfmt`を`^0.73.0`、`zod`を`^4.6.7`へ更新しました。Loutre本体・CLI・create-loutreの`ts-pattern`を`^5.9.2`、GraphQLの`graphql-ws`を`^6.4.0`へ更新しています。

  開発・テスト環境とwebsiteの依存packageを更新し、READMEと関連ガイドの英語表記を整えました。公開6packageは同じ0.9.1でリリースします。

- Updated dependencies [70d4d69]
  - @loutrejs/loutre@0.9.1

## 0.9.0

### Minor Changes

- 53cfcf6: `injectInquirer()`を公開し、独自loggerなどで依存元のProviderやExecutionの構築metadataを取得できるようにしました。metadataは構築情報の保存に使用し、依存宣言の分岐には使用しないでください。

  `defineModule({ ... })`で静的Moduleを直接定義できるようにしました。引数なしのModule templateも`imports`や`modules`へ括弧なしで渡せます。同じModuleを共有した際のidentityを維持し、引数付きModuleは従来どおり明示的に生成します。

  Node.jsとBunのRuntimeは`create()`時点で終了hookを登録し、HTTPを持たないTask / Queue WorkerもSIGINT / SIGTERMで終了処理できるようにしました。`create({ shutdownHooks: false })`で無効化できます。終了失敗時にも新規受付を停止し、実行中処理のdrainとProvider cleanupの境界を揃えました。signal後にdrainがtimeoutした場合も、Workerの終了処理を継続します。

  破壊的変更としてBunの最低要件を1.4.0へ引き上げ、Bun 1.3の対応を終了しました。Bun Adapter、CLI、create-loutreは1.4.0未満での実行を拒否し、生成するBun projectにも`engines.bun: >=1.4.0`を設定します。

  canonical Application Modelに宣言されていない依存をRuntimeで解決できていた問題を修正しました。構築metadataやEnv / Argsの値によって依存を追加すると、`LUTRE_DI_UNDECLARED_DEPENDENCY`で失敗します。必要な依存は無条件に宣言し、条件分岐はhandlerなどの実行処理へ移してください。factory Providerの依存は`inject`配列で宣言します。

  独自Execution ExtensionのRuntime / Host contextは、`executions`の各要素を`{ execution, resolve }`のbindingとして受け取るように変更しました。`applicationRuntime.resolve()`の代わりに、対象Executionのbindingが持つ`resolve()`を使用してください。

  Code scanningの指摘に対応し、CLIのignore globのescapeを修正しました。create-loutreのpackage名の正規化で長いhyphen列による処理時間の増大を防ぎ、GraphQLの検証コードから動的な文字列評価と入力依存の実行先も除きました。

  依存packageを更新し、利用ガイドとexampleを新しいModule定義・Worker終了処理・依存宣言の契約へ揃えました。公開6packageは同じ0.9.0でリリースします。

### Patch Changes

- Updated dependencies [53cfcf6]
  - @loutrejs/loutre@0.9.0

## 0.8.2

### Patch Changes

- 9cf1875: Node.jsとBunで`serve({ port: 0 })`を使った際、OSが割り当てた実際のportを`listener.port`とReadyログに反映するよう修正しました。

  Node.jsとBun上のCLIで、native addonを使うApplicationを`check --entry`で検証できるよう修正しました。依存packageを元の配置から読み込み、native binaryと相対requireの配置を維持します。

  GraphQL型生成とCLIのformatterの依存packageを更新しました。

  websiteのMermaid依存を更新し、KaTeXのセキュリティ更新を取り込みました。

- Updated dependencies [9cf1875]
  - @loutrejs/loutre@0.8.2

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

- 6375229: HTTP Contractをネストして構成できるようにしました。親routeのpath・pipeline・responsesを子Contractへ継承し、`AppContract.http.api.me.profile`のように解決済みContract nodeを型安全に参照してImplementationへ割り当てられます。あわせて不正なContract compositionを型レベルで検出するようにしました。

  ApplicationのContract rootはImplementationから推論するようにし、`defineApplication`への`contract`指定を不要にしました。create-loutreのテンプレートも新しいApplication定義へ更新しています。

  CLIでbundleされたLoutreとアプリケーション側LoutreのContract identityを共有し、bundle境界をまたぐContract判定が正しく動作するようにしました。

- Updated dependencies [6375229]
  - @loutrejs/loutre@0.5.0

## 0.4.1

### Patch Changes

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
