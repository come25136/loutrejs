# 現行実装上の補足

`architecture.md`を設計上のsource of truthとする。この文書には、公開APIの具体的な構文と
runtime境界に関する補足だけを記録する。

- Response helperは`ctx.response.<response>({ body, headers })`でLogical Resultを生成する。
  Protocol Finalizationがoutput validation、static/dynamic header merge、serializationを担当する。
- HTTP decodeは同名query keyの複数値を`string[]`、単一値を`string`、headerを小文字keyの
  recordとして表現する。request schema failureはJSON 400、unknown failureはJSON 500へ変換する。
- DI用typed tokenには`token<Value>('stable.id')`を使う。execution-local dataはLayerが`ctx.state`へcontributeする。
- Layerは`layer({ ...metadata, state: type<Contribution>(), factory })`のsingle-call objectで定義する。`type<T>()`はruntime semanticsを持たないtype carrierで、Contributionだけを明示しながら`requires`などの値推論とfactoryのcontextual typingを維持する。TypeScriptのPartial Type Argument Inferenceに依存するbuilder分離は採用しない。`factory`はInjection Context内で同期実行してrequest間で共有するruntime functionを1つ生成する。
- `requires`にはContext keyではなく依存するLayer identityを指定する。Layer runtimeの`ctx.state`にはrequired Layerとそのtransitive dependencyが追加したstateだけを公開する。
- state contributionは`next(contribution)`で後段へ渡す。`next()`は常に`Promise<void>`を返す。同じtop-level namespaceはplain object同士で異なるpayload propertyを追加する場合のみ拡張でき、既存namespace / payload propertyの暗黙上書きはRuntimeが拒否する。
- Layerはcallable objectである。`layerA`をPipelineへ直接置くと`next()`は親後段を実行し、
  `layerA([...])`と置くと`next()`は指定したchild Pipelineだけを実行する。呼び出しはfactoryを
  再実行せず、同じLayer definitionへchildを関連付けた利用箇所を生成する。
- 正常なLayer終了は`next()`のexactly once、または`next()`なしの`shortCircuit(result)`である。
  nextのskip/reentry、next後のshortCircuitはRuntime Errorとする。downstream errorはLayerがcatchしても
  Pipelineが元の値を再throwする。
- Contextとvalidation stateはchild終了後も親後段へ伝播する。terminalはdepth-first順で全体に
  ちょうど1つ、かつ最後に置く。
- `shortCircuits` metadataはProtocol responseとの静的照合とGraph表示に使う。HTTP response mapと
  Pipelineはliteral objectおよびtupleのまま渡し、型情報の消去を拒否する。
- `requiresValidated`はLayerが必要とするvalidation済みinputを静的に宣言する。
- CLIの`dev` / `start`は明示的なentry pathを必須とし、filesystem conventionでModuleを探索しない。
- HTTP request bodyはschemaを`request.body`へ直接宣言し、body表現を決める`Content-Type`は`request.headers` schemaへ宣言する。`validate.body`は`validate.headers`より後に置き、header validation後のmedia typeに応じてJSON、`text/*`、`multipart/form-data`をWeb標準表現へdecodeし、それ以外は`ReadableStream`をvalidationへ渡す。decodeは`validate.body`到達時まで遅延し、validationを置かないraw処理ではparameterを含むheader値と未消費streamを保持する。同じeffective Pipelineに同じ`validate.*`を複数回置くことは禁止する。
- HTTP Controller Contextの`signal`は元の`Request.signal`である。server-stream finalizationは
  abort時に`iterator.return()`を呼ぶ。
- linked Applicationはplatform-neutralなES2024 ESMとしてbundleし、Runtime固有adapterが境界を持つ。
