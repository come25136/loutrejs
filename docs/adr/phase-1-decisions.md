# 現行実装上の補足

`architecture.md`を設計上のsource of truthとする。この文書には、公開APIの具体的な構文と
runtime境界に関する補足だけを記録する。

- Response helperは`ctx.response.<variant>({ body, headers })`でLogical Resultを生成する。
  Protocol Finalizationがoutput validation、static/dynamic header merge、serializationを担当する。
- HTTP decodeは同名query keyの複数値を`string[]`、単一値を`string`、headerを小文字keyの
  recordとして表現する。request schema failureはJSON 400、unknown failureはJSON 500へ変換する。
- DI用typed tokenには`token<Value>('stable.id')`、Execution Contextには
  `contextKey<{ name: Value }>('name')`を使う。両者は別のGraph依存として扱う。
- Layerは`layer({ ...metadata, factory })`で定義する。metadata fieldはfactoryを実行せず解析でき、
  `factory`はInjection Context内で同期実行してrequest間で共有するruntime functionを1つ生成する。
- Layer runtimeは`(ctx, next)`だけを受け取る。`ctx`には`requires`で宣言したContextを公開し、
  `provide`がある場合は`next(provided)`で値を追加する。1つのLayerがprovideできるContext Keyは最大1つ。未宣言property、不足property、
  既存Contextの上書きはRuntimeが拒否する。
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
- HTTP bodyはJSON、`text/*`、`multipart/form-data`をWeb標準表現へdecodeし、それ以外のmedia typeは
  `ReadableStream`のownershipを`validate.body`へ渡す。
- HTTP Controller Contextの`signal`は元の`Request.signal`である。server-stream finalizationは
  abort時に`iterator.return()`を呼ぶ。
- linked Applicationはplatform-neutralなES2024 ESMとしてbundleし、Runtime固有adapterが境界を持つ。
