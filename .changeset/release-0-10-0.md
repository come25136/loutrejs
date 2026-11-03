---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/cli': minor
'create-loutre': minor
'@loutrejs/graphql': minor
---

0.10.0ではロガーをDIで管理できるようにし、GraphQLの公開先をHTTP Contractで定義する方式に変更しました。IDや時刻などの取り違えを防ぐため、Branded Typesも導入しています。互換性のないAPI変更を含み、公開6パッケージを同じバージョンでリリースします。

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
