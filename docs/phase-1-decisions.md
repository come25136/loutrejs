# Phase 1実装上の最小決定

`architecture.md`だけを設計上のsource of truthとします。このメモには、
architectureでexact syntaxまたは挙動が意図的にOPENとされている項目のうち、
Fixture Aを実行するために必要だった最小の選択だけを記録します。

- Response helperには`ctx.response.<variant>({ body, headers? })`を採用しました。
  static headerはresponse定義、requestごとのdynamic headerはresult objectに置きます。
  これはlogical HTTP resultを生成するだけで、validation、header merge、serializationは
  引き続き内部のProtocol Finalizationが担当します。
- HTTP decodeでは、同じquery keyが複数ある場合を`string[]`、1つの場合を
  `string`で表し、headerを小文字keyのrecordで表します。これはadapter内部の
  暫定的な表現であり、恒久的なPublic Schema APIとしてFROZENにするものではありません。
- Application / Protocol error handler APIが設計されるまで、request inputのschema
  failureはadapterが最小のJSON 400へ変換し、unknown failureはJSON 500へ変換します。
  Controllerが返す宣言済みresultは、常にnamed variantとoutput validationを通ります。
- outbound hookがthrowした場合も、すでにenteredとなったLayerのunwindを続け、
  最後に発生したfailureを保持します。これはoutbound semanticsがOPENである間の、
  cleanupを優先した暫定ルールです。
- Runtimeのconstructor resolutionは、明示された`@Inject(TOKEN)`注釈を使用します。
  decoratorのないclass型constructor依存辺についてはruntime type reflectionを使わず、
  manifest不足のdiagnosticとして失敗させます。ASTから導出するconstructor依存辺は、
  Compiler IRとの境界に追加します。
- DI用typed tokenは`token<Value>('stable.id')`で生成します。Execution Contextには
  `contextKey('name').of<Value>()`を使用し、DI Graphとは分離します。`LayerDescriptor`は
  `requires` / `provides`の具体的なContext Key tupleを保持し、terminal到達時のproperty
  shapeをprocedure固有Pipelineから導出します。Layerの`inbound`は`provides`に対応する
  objectを返し、runtimeは不足property、未宣言property、暗黙上書きを内部assertionで拒否します。
- Layer factoryの最小構文は`layer({...})`と`layer<Context>({...})`を採用しました。
  Context Key tupleの完全な推論が必要なLayerは、`inbound`引数へContext型を注釈することで
  一段形式のまま型情報を保持します。
- short circuitの最小APIには`shortCircuit(result, state?)`を採用しました。これを返した
  Layer自身は正常にenteredとなり、任意のstateとともにoutboundの対象になります。
  残りのinbound Layerとterminalは実行せず、resultは通常どおりoutbound unwind後に
  Protocol Finalizationを通ります。
- ASTによるLayer context型解析が入るまでの明示metadataとして、Layer descriptorに
  `requiresValidated`を追加しました。Compilerはこれを使って`validate.*`との順序を
  検証します。これはvalidation omission policyを決めるものではなく、Layerが実際に
  必要とするvalidation済みinputだけを宣言する最小の橋渡しです。
- CLIの`dev` / `start`はfilesystem conventionでModuleを探索せず、明示的なentry pathを
  必須とします。entryは`default`または`application` named exportとして
  `HttpApplication`を公開します。Config fileの名前や形式は引き続きOPENのままです。
- HTTP body decodeではJSONと`text/*`だけを内部parseし、それ以外のmedia typeは
  `ReadableStream`のownershipを`validate.body`へ渡します。Standard Schemaはstreamを
  検証またはtransformして返せるため、Controllerまでの経路でframeworkが暗黙に
  bufferしたり複数回consumeしたりしません。
