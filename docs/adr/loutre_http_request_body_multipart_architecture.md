# Loutre HTTP Request Body / Multipart Architecture

ステータス: Accepted

## 決定

Loutre の HTTP request body を、現在の `contentType + StandardSchema` 固定モデルから、Server decode、typed Client encode、OpenAPI projection を 1 つの Contract から提供できる拡張可能な Request Body Definition へ再設計する。

multipart は `@loutrejs/loutre` 本体へ実装しない。別 package `@loutrejs/multipart` として提供し、multipart parser / encoder もその package が所有する。

`@loutrejs/loutre` と `@loutrejs/multipart` はともに、この機能のための外部 runtime dependency を追加しない。特に Remix / Busboy / Fastify 等の parser package は Loutre の public API や runtime dependency に含めない。

この ADR は `docs/adr/loutre_openapi.md` の「HTTP request body Contract」で決定した `{ contentType, schema }` 形式を request body abstraction について supersede する。OpenAPI 3.2.0 を canonical output とする決定自体は変更しない。

## 背景

現在の request body は概ね以下の形を取る。

```ts
request: {
  body: {
    contentType: 'application/json',
    schema: CreateUser,
  },
}
```

Server runtime は pipeline 実行前の `decodeRequest()` で `request.json()` / `request.formData()` / `request.text()` を呼び、Client は `contentType` を見て JSON encode し、OpenAPI は `schema` を直接 materialize する。

この構造には以下の問題がある。

- 認証 Layer より前に request body を消費する
- multipart upload が `Request.formData()` に固定され、巨大ファイルを end-to-end streaming できない
- request body format を追加するたびに HTTP runtime / Client / OpenAPI の special case が増える
- Server output type と Client input type が `SchemaOutput` / `SchemaInput` に固定される
- multipart parser を Core に導入すると、Loutre 本体の dependency policy と責務境界が崩れる
- `Content-Length` と実際の body byte 数の両方を用いた一貫した resource limit がない

Loutre は既に Node runtime で `http.request.streaming` capability を持ち、`IncomingMessage` を Web `ReadableStream` に変換している。この基盤を利用し、request body 全体を lazy / streaming aware にする。

## 設計原則

以下を固定する。

```text
HTTP Core != multipart parser
multipart != storage
streaming != chunk 単位で読んだ後に part 全体を buffer すること
```

Core の責務は以下。

- request body lifetime
- raw HTTP body 全体の size limit
- body extension contract
- Server decode boundary
- typed Client encode integration
- OpenAPI integration
- abort / cancel / backpressure の共通 semantics

`@loutrejs/multipart` の責務は以下。

- multipart wire format
- multipart parser / encoder
- part-level validation
- typed multipart DSL
- buffered / true streaming multipart
- multipart OpenAPI projection

S3 / R2 / filesystem 等の storage は Application Service の責務とし、multipart package へ storage abstraction を入れない。

## Package 境界

```text
@loutrejs/loutre
│
├─ HttpRequestBodyDefinition
├─ defineHttpRequestBody()
├─ lazy body runtime
├─ raw body size limit
├─ body lifecycle / cancel
├─ http.body.json()
├─ http.body.text()
├─ http.body.bytes()
├─ http.body.stream()
├─ typed client integration
└─ OpenAPI extension contract
          ▲
          │ public extension API
          │
@loutrejs/multipart
│
├─ multipart.field()
├─ multipart.file()
├─ multipart.optional()
├─ multipart.array()
├─ multipart.buffered()
├─ multipart.stream()
├─ streaming multipart parser
├─ multipart encoder
├─ multipart validation
└─ OpenAPI integration
```

`@loutrejs/multipart` は `@loutrejs/loutre` のみに依存する。

細分化した以下の package は作らない。

```text
@loutrejs/multipart-core
@loutrejs/multipart-parser
@loutrejs/multipart-remix
```

ユーザー向け package は `@loutrejs/multipart` だけとする。

## Core Request Body Definition

現在の `HttpRequestBodyDefinition<TSchema>` を廃止し、概念的に以下へ置き換える。

```ts
export interface HttpRequestBodyDefinition<
  TServerOutput = unknown,
  TClientInput = unknown,
> {
  readonly kind: 'http-request-body'

  /** Contract 上の media type。multipart の boundary は含めない。 */
  readonly contentType: string

  /** raw HTTP request body 全体の byte 上限。 */
  readonly maxSize: number

  /** validate.body 到達時の Server decode。 */
  readonly decode: (
    source: HttpRequestBodySource,
  ) =>
    | HttpDecodedRequestBody<TServerOutput>
    | Promise<HttpDecodedRequestBody<TServerOutput>>

  /** typed HTTP Client 用 wire encode。 */
  readonly encode: (
    value: TClientInput,
  ) =>
    | HttpEncodedRequestBody
    | Promise<HttpEncodedRequestBody>

  /** OpenAPI 3.2 projection。 */
  readonly openapi?: (
    context: HttpRequestBodyOpenApiContext,
  ) => HttpRequestBodyOpenApiMediaType
}
```

実際の public creation API は object literal の直接生成ではなく `defineHttpRequestBody(...)` を提供する。内部 brand や runtime metadata を利用者へ意識させない。

`maxSize` は body format package が安全な有限 default を提供できる形式では省略可能としてよいが、生成後の `HttpRequestBodyDefinition` 上では必ず有限の number に正規化されている状態にする。streaming raw body / file upload のように妥当な共通 default を決められない形式では public builder 側で `maxSize` を必須にする。

## Server decode source

body codec へは raw `Request` そのものを渡さない。

```ts
export interface HttpRequestBodySource {
  readonly stream: ReadableStream<Uint8Array> | null
  readonly contentType: string | null
  readonly contentLength: number | undefined
  readonly headers: Headers
  readonly signal: AbortSignal
}
```

`stream` は Core が raw body `maxSize` を監視する wrapper を適用したものとする。

codec が runtime adapter や Node.js API へ直接依存することは禁止する。

## Body lifecycle

streaming body では decode 完了と request body 消費完了が一致しない。そのため decode result は lifecycle を持つ。

```ts
export interface HttpDecodedRequestBody<T> {
  readonly value: T
  readonly finalize?: (
    outcome: HttpRequestBodyOutcome,
  ) => void | Promise<void>
}

export type HttpRequestBodyOutcome =
  | 'success'
  | 'short-circuit'
  | 'error'
```

buffered codec は通常 decode 時点で完了する。streaming codec は Controller 実行後の `finalize()` で未消費 body、cancel 状態、required part validation 等を確定できる。

## Pipeline semantics

request body は pipeline 開始前に decode しない。

```text
Request
 │
 ├─ route match
 ├─ params/query/headers の raw decode
 │
 └─ request.body は未消費
       │
       ▼
 pipeline
       │
       ├─ authentication
       ├─ authorization
       ├─ ...
       ├─ validate.body
       │      │
       │      ├─ Content-Type check
       │      ├─ Content-Length precheck
       │      ├─ maxSize stream wrapper
       │      └─ bodyDefinition.decode()
       │
       └─ http.controller
```

例えば以下では、認証失敗時に multipart body を parse しない。

```ts
pipeline: [
  authentication,
  validate.body,
  http.controller,
]
```

pipeline が `validate.body` より前に short-circuit した場合、framework が未読 request body を cancel する。

## Content-Length と maxSize

`Content-Length` は早期拒否の最適化としてだけ利用する。

```text
Content-Length > maxSize
↓
body を 1 byte も読まず 413
```

ただし `Content-Length` は信用せず、実 stream にも必ず byte counter を適用する。

```text
chunk
↓
total += chunk.byteLength
↓
maxSize 超過
↓
stream cancel
↓
413 Payload Too Large
```

multipart の `maxSize` は boundary / part headers を含む raw HTTP body 全体の byte 数とする。

## validate.body の idempotency

body は one-shot stream なので decode は 1 request につき 1 回だけ行う。

同一 pipeline に複数の `validate.body` が存在しても、runtime は以下の state として memoize する。

```text
unvalidated
↓
decoding
↓
validated
```

2 回目以降の `validate.body` は既存 value を利用し、request stream を再消費しない。

## Controller / Client 型推論

Server body type は Standard Schema に限定しない。

```ts
type HttpRequestBodyOutput<TBody> =
  TBody extends HttpRequestBodyDefinition<infer TOutput, any>
    ? TOutput
    : never
```

Client input も同様に body definition から得る。

```ts
type HttpRequestBodyInput<TBody> =
  TBody extends HttpRequestBodyDefinition<any, infer TInput>
    ? TInput
    : never
```

これにより multipart streaming body、raw `ReadableStream`、将来の protobuf / msgpack 等も同じ Contract model に乗る。

## Core built-in body codecs

### JSON

```ts
body: http.body.json(
  z.object({
    name: z.string(),
  }),
)
```

```ts
http.body.json(schema, {
  contentType: 'application/json',
  maxSize: 1024 * 1024,
})
```

既定 `maxSize` は 1 MiB とする。

`application/json` および明示された `application/*+json` content type を JSON として扱う。

### Text

```ts
body: http.body.text(z.string().min(1))
```

schema 省略時は `string` を返す。

```ts
body: http.body.text()
```

既定 `maxSize` は 1 MiB とする。

### Bytes

```ts
body: http.body.bytes({
  contentType: 'application/octet-stream',
  maxSize: 8 * MiB,
})
```

Server output は `Uint8Array`。

### Raw stream

```ts
body: http.body.stream({
  contentType: 'application/octet-stream',
  maxSize: 5 * GiB,
})
```

Server output は `ReadableStream<Uint8Array>`。

巨大な単一ファイル PUT 等では multipart ではなくこちらを推奨する。

## Core から multipart special case を削除する

以下のような request decoder の分岐は削除する。

```ts
if (declaredMediaType === 'multipart/form-data') {
  body = await request.formData()
}
```

Core は multipart を知らない。

multipart を使う application のみ以下を import する。

```ts
import { multipart } from '@loutrejs/multipart'
```

## Multipart public DSL

part shape と buffered / streaming strategy を分離する。

```ts
const UploadParts = {
  title: multipart.field(
    z.string().min(1),
    {
      maxSize: 8 * KiB,
    },
  ),

  avatar: multipart.file({
    maxSize: 10 * MiB,
    contentTypes: [
      'image/jpeg',
      'image/png',
    ],
  }),

  attachments: multipart.array(
    multipart.file({
      maxSize: 25 * MiB,
      contentTypes: [
        'application/pdf',
      ],
    }),
    {
      max: 4,
    },
  ),

  note: multipart.optional(
    multipart.field(
      z.string().max(500),
      {
        maxSize: 4 * KiB,
      },
    ),
  ),
}
```

streaming：

```ts
body: multipart.stream(
  UploadParts,
  {
    maxSize: 100 * MiB,
  },
)
```

buffered：

```ts
body: multipart.buffered(
  UploadParts,
  {
    maxSize: 100 * MiB,
  },
)
```

## Multipart cardinality

通常の part は required single value とする。

```ts
avatar: multipart.file(...)
```

```text
min = 1
max = 1
```

optional：

```ts
multipart.optional(...)
```

```text
min = 0
max = 1
```

array：

```ts
multipart.array(part, {
  min: 0,
  max: 4,
})
```

`max` は必須とし、無制限 array は提供しない。

`maxParts` は利用者に別途二重定義させない。part Contract から最大 part 数を自動導出して parser limit に利用する。

## Unknown part policy

default は reject。

Contract にない `name` を受信した時点で 400 とする。

必要な場合だけ有限個の discard を許す。

```ts
multipart.stream(parts, {
  maxSize: 100 * MiB,
  unknownParts: {
    action: 'discard',
    max: 4,
  },
})
```

unknown part の無制限 discard は禁止する。

`passthrough` は提供しない。自由形式 multipart が必要な場合は別の明示的な body definition として設計する。

## Multipart field

```ts
multipart.field(schema, {
  maxSize?: number,
})
```

field は小さい文字列値として buffer し、UTF-8 decode 後に Standard Schema で validation する。

既定 `maxSize` は 64 KiB。

```text
part body
↓
field maxSize check
↓
UTF-8 decode
↓
Standard Schema validation
↓
part.value
```

不正 UTF-8 は 400。

## Multipart file

```ts
multipart.file({
  maxSize: 10 * MiB,
  contentTypes: [
    'image/jpeg',
    'image/png',
  ],
})
```

file `maxSize` は必須とする。

file body は buffer しない。

```text
request.body
↓
boundary parser
↓
file part stream
↓
Controller
↓
S3 / R2 / filesystem
```

file size に比例して framework memory が増える実装は禁止する。

## Streaming multipart output

```ts
export interface MultipartStream<TPart>
  extends AsyncIterable<TPart> {
  discardRemaining(): Promise<void>
  cancel(reason?: unknown): Promise<void>
}
```

part union は `name` で discriminated union になる。

```ts
for await (const part of ctx.input.body) {
  if (part.name === 'title') {
    part.kind
    // 'field'

    part.value
    // string
  }

  if (part.name === 'avatar') {
    part.kind
    // 'file'

    part.stream
    // ReadableStream<Uint8Array>
  }
}
```

## File part API

```ts
export interface MultipartFilePart<
  TName extends string = string,
> {
  readonly kind: 'file'
  readonly name: TName
  readonly index: number
  readonly filename: string
  readonly contentType: string | undefined
  readonly headers: Readonly<Record<string, string>>
  readonly stream: ReadableStream<Uint8Array>
  readonly completed: Promise<MultipartFileCompletion>

  discard(): Promise<MultipartFileCompletion>
}

export interface MultipartFileCompletion {
  readonly size: number
}
```

最終 `size` は stream 完了後にしか確定しないため、開始時の `part.size` は提供しない。

## Part consumption rule

streaming parser は lending stream として設計する。

現在の file part が consume / discard されるまで次の part へ進まない。

```text
next part
   ↑
current part consume / discard が必要
```

未消費のまま次へ進もうとした場合、hang させず `MultipartPartNotConsumedError` を throw する。

skip は明示的に行う。

```ts
await part.discard()
```

## Multipart parser implementation

外部 parser dependency は使わず、`@loutrejs/multipart` 内に Web Streams ベースの state machine を実装する。

```text
START
  ↓
BOUNDARY
  ↓
HEADERS
  ↓
BODY
  ↓
BOUNDARY
  ├─ next part
  └─ END
```

BODY state では boundary search に必要な最小 tail だけを保持する。

```text
input chunk
↓
boundary search
├─ safe prefix       -> part.stream へ流す
└─ boundary candidate -> carry として保持
```

memory complexity は概ね以下を目標とする。

```text
O(
  upstream chunk
  + boundary length
  + maxHeaderSize
  + buffered field size
)
```

file size には比例させない。

## Backpressure

parser は background で request body を先読みし続けない。

```text
Storage consumer が遅い
↓
part.stream.pull() が止まる
↓
parser が request.body を pull しない
↓
upstream ReadableStream が止まる
↓
network read に backpressure
```

file chunk を無制限 queue へ蓄積しない。

## Multipart limits の責務

Core level：

- raw HTTP body `maxSize`

multipart parser level：

- boundary length
- part header size
- total part count

Contract level：

- field size
- file size
- cardinality
- allowed content type
- unknown field policy
- required field

既定値：

```text
maxHeaderSize = 8 KiB
field maxSize = 64 KiB
```

file `maxSize` と multipart body `maxSize` は必須。

## Required part validation

required part の不足は final boundary まで確定できない。

```text
END boundary
↓
required part cardinality check
↓
不足 -> 400 Validation failed
```

stream iterator の正常完走時に cardinality validation を確定する。

## Successful Controller と未消費 body

Controller が success response を返した時点で streaming body が未完走かつ明示 cancel されていない場合、成功として扱わない。

framework error `LUTRE_HTTP_BODY_NOT_CONSUMED` として 500 にする。

Controller は以下のいずれかを行う。

完全に処理する：

```ts
for await (const part of ctx.input.body) {
  // consume all
}
```

残りを validation しながら捨てる：

```ts
await ctx.input.body.discardRemaining()
```

処理を明示的に中断する：

```ts
await ctx.input.body.cancel(reason)
```

Controller 到達前の pipeline short-circuit では framework が自動 cancel する。

## Buffered multipart

buffered mode も同じ low-level streaming parser を利用する。別 parser を実装しない。

```text
streaming parser
↓
parts
↓
collect
↓
typed object
```

Server output 例：

```ts
ctx.input.body.title
// string

ctx.input.body.avatar
// File

ctx.input.body.attachments
// File[]

ctx.input.body.note
// string | undefined
```

file 値には Web 標準 `File` を使用する。

## Typed Client input

stream / buffered の wire Contract は同じなので Client input type も共有する。

```ts
await client.upload({
  body: {
    title: 'hello',
    avatar: file,
    attachments: [pdf1, pdf2],
  },
})
```

server-to-server streaming 用に `multipart.source()` を提供する。

```ts
multipart.source({
  filename: 'video.mp4',
  contentType: 'video/mp4',
  body: stream,
  size: knownSize,
})
```

```ts
export interface MultipartFileSource {
  readonly filename: string
  readonly contentType?: string
  readonly body:
    | Blob
    | Uint8Array
    | ReadableStream<Uint8Array>
  readonly size?: number
}
```

file client input は `File | MultipartFileSource` とする。

## Multipart encoder

`@loutrejs/multipart` が encoder も所有する。

```text
boundary
↓
field headers
↓
field bytes
↓
boundary
↓
file headers
↓
file stream
↓
boundary
...
```

file は buffer しない。

encoder は以下を返す。

- `ReadableStream<Uint8Array>`
- boundary を含む実際の `Content-Type`
- 全 part size が既知の場合のみ `Content-Length`

boundary 生成には Web Crypto を使用し、Node.js 専用 API へ依存しない。

## HttpClient architecture

現在の Transport にある JSON encode 判定を body definition へ移動する。

```text
createHttpClient
↓
bodyDefinition.encode(logicalBody)
↓
HttpEncodedRequestBody
↓
transport
```

```ts
export interface HttpEncodedRequestBody {
  readonly body: BodyInit
  readonly contentType: string
  readonly contentLength?: number
}
```

Transport は body format を知らない。

Transport の責務は以下に限定する。

- URL construction
- headers
- HTTP send
- response receive

request headers と body codec の両方から `Content-Type` を指定することは禁止する。boundary を含む最終 `Content-Type` は body codec を唯一の source of truth とする。

Fetch transport が `ReadableStream` body を送信する場合、必要な runtime では `duplex: 'half'` を設定する。これは transport 実装の責務であり multipart encoder は runtime 差を知らない。

## OpenAPI integration

`generateOpenApi()` は request body の内部 kind を判定しない。

body definition の `openapi(context)` projection を利用する。

```ts
interface HttpRequestBodyOpenApiContext {
  schema(
    schema: StandardSchemaV1,
    name: string,
  ): JsonSchema
}
```

multipart package は同じ part Contract から OpenAPI 3.2 の `multipart/form-data` schema / encoding を生成する。

buffered / stream は wire Contract が同じなので OpenAPI schema も共有する。

既存の Standard JSON Schema integration は field schema materialization に再利用する。

## HTTP error semantics

| 状況 | status |
| --- | ---: |
| Content-Type 不一致 | 415 |
| raw body `maxSize` 超過 | 413 |
| file `maxSize` 超過 | 413 |
| field resource limit 超過 | 413 |
| part header resource limit 超過 | 413 |
| malformed multipart | 400 |
| unknown part | 400 |
| required part missing | 400 |
| duplicate single part | 400 |
| array `max` 超過 | 400 |
| field schema failure | 400 |
| file content type mismatch | 400 |
| client abort | abort として伝播 |
| success 時 body 未消費 | 500 |
| parser implementation bug | 500 |

resource limit と Contract validation failure は区別する。

413 response：

```json
{
  "error": "Payload Too Large"
}
```

malformed wire input：

```json
{
  "error": "Invalid request"
}
```

Contract validation failure：

```json
{
  "error": "Validation failed"
}
```

内部 schema 詳細や upload filename を framework default response へ露出しない。

## Runtime capability

`multipart.stream()` の API availability と end-to-end network streaming guarantee は分けて扱う。

`http.request.streaming` capability を持つ runtime では以下を保証できる。

```text
network
↓
Request.body
↓
multipart parser
↓
part.stream
```

AWS Lambda 等、adapter が event body を materialize 済みの runtime では Controller API は stream でも network からの end-to-end streaming ではない。

ドキュメントではこの差を明示し、すべての runtime で「完全 streaming」と表現しない。

## Parser security / correctness tests

low-level parser は少なくとも以下を test する。

- boundary が chunk の全位置で分割される
- opening / final boundary
- quoted boundary parameter
- invalid boundary
- boundary 最大長
- CRLF handling
- header terminator
- oversized header
- malformed Content-Disposition
- duplicate headers
- duplicate field names
- quoted filename
- Unicode name / filename
- abort during header
- abort during file
- empty file
- empty field
- zero-part body
- trailing invalid bytes
- boundary-like bytes inside file content
- 1 byte chunk stream
- very large chunk stream
- random chunk segmentation

特に file content 内の boundary-like bytes を誤 boundary 認識しないことを重点的に検証する。

## Memory / backpressure tests

synthetic な大容量 stream を用い、file size に比例して parser memory が増えないことを検証する。

consumer を意図的に遅くし、downstream が停止した時に upstream pull も停止することを確認する。

実装が part content を `Uint8Array[]` 等へ全量保持してから yield する方式へ退行しないよう test を持つ。

## Type tests

少なくとも以下を `*.test-d.ts` で固定する。

```ts
part.name === 'avatar'
```

で `MultipartFilePart<'avatar'>` へ narrow されること。

buffered mode で：

```ts
body.avatar
// File

body.note
// string | undefined

body.attachments
// File[]
```

Client で file input が：

```ts
File | MultipartFileSource
```

となること。

## Integration tests

以下の round-trip を test する。

```text
typed Loutre Client
↓
streaming multipart encoder
↓
HTTP runtime
↓
Loutre multipart parser
↓
Controller
```

対象：

- field
- single file
- optional part
- multiple files
- large streaming file
- abort
- 413
- malformed 400
- Contract validation 400
- content type mismatch 415
- Client encode
- OpenAPI

Node / Bun / Deno / Cloudflare Workers 等の conformance では runtime capability に応じて streaming behavior を確認する。

## 想定ファイル構成

Core：

```text
packages/loutre/src/http/
├─ request-body/
│  ├─ definition.ts
│  ├─ runtime.ts
│  └─ builtins.ts
├─ application.ts
├─ client.ts
├─ definitions.ts
└─ ...
```

現在の薄い `request-body.ts` は directory へ昇格する。

Multipart：

```text
packages/multipart/
├─ package.json
├─ README.md
└─ src/
   ├─ index.ts
   ├─ definition.ts
   ├─ types.ts
   ├─ runtime/
   │  ├─ parser.ts
   │  ├─ headers.ts
   │  └─ encoder.ts
   └─ openapi.ts
```

実装時に責務上より自然な分割が判明した場合、ファイル名単位は変更してよい。ただし package 境界と public API の責務はこの ADR を維持する。

## Migration

v0 なので compatibility shim は持たず破壊的に整理する。

旧 JSON：

```ts
body: {
  contentType: 'application/json',
  schema: CreateUser,
}
```

新：

```ts
body: http.body.json(CreateUser)
```

旧 multipart：

```ts
body: {
  contentType: 'multipart/form-data',
  schema: z.instanceof(FormData),
}
```

新 buffered：

```ts
body: multipart.buffered(parts, {
  maxSize: 100 * MiB,
})
```

新 streaming：

```ts
body: multipart.stream(parts, {
  maxSize: 100 * MiB,
})
```

既存 examples / tests / docs / website snippets は新しい body API へ同期する。

## 最終利用例

```ts
import { contract, implementation } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { multipart } from '@loutrejs/multipart'
import { z } from 'zod'

const UploadParts = {
  title: multipart.field(z.string().min(1)),

  avatar: multipart.file({
    maxSize: 10 * MiB,
    contentTypes: [
      'image/jpeg',
      'image/png',
    ],
  }),

  documents: multipart.array(
    multipart.file({
      maxSize: 25 * MiB,
      contentTypes: [
        'application/pdf',
      ],
    }),
    {
      max: 4,
    },
  ),
}

const AppContract = contract([
  http({
    upload: {
      method: 'POST',
      path: '/upload',

      request: {
        body: multipart.stream(
          UploadParts,
          {
            maxSize: 100 * MiB,
          },
        ),
      },

      responses: {
        ok: {
          status: 200,
          body: z.object({
            uploaded: z.number(),
          }),
        },
      },

      pipeline: [
        authentication,
        validate.body,
        http.controller,
      ],
    },
  }),
])
```

Controller：

```ts
const UploadController = implementation({
  contract: AppContract,
  protocol: http,

  factory: (storage: FileStorage) => ({
    async upload(ctx) {
      let uploaded = 0

      for await (const part of ctx.input.body) {
        if (part.kind === 'field') continue

        await storage.put({
          filename: part.filename,
          contentType: part.contentType,
          body: part.stream,
          signal: ctx.signal,
        })

        const completed = await part.completed

        ctx.logger.info('Uploaded file', {
          name: part.name,
          size: completed.size,
        })

        uploaded++
      }

      return ctx.response.ok({
        body: {
          uploaded,
        },
      })
    },
  }),
})
```

## 実装順序

実装は以下の dependency order で進める。

1. Core `HttpRequestBodyDefinition` / `defineHttpRequestBody()` / input-output type extraction
2. lazy request body runtime と `maxSize` / lifecycle / cancel
3. `http.body.json/text/bytes/stream`
4. typed Client を body encoder driven に変更
5. OpenAPI を body projection driven に変更
6. 既存 JSON / text / raw body tests と examples を新 API へ migration
7. `@loutrejs/multipart` package と part DSL
8. low-level true streaming multipart parser
9. multipart streaming runtime / lifecycle / validation
10. buffered collector
11. multipart Client encoder
12. multipart OpenAPI projection
13. type / integration / conformance / memory / backpressure tests
14. docs / website / examples の同期

各段階で Core に multipart 固有分岐を追加して問題を回避しない。

## 非目標

この ADR の対象外：

- S3 / R2 / filesystem storage abstraction
- virus scan / image processing 等の application concern
- resumable upload protocol
- tus protocol
- S3 multipart upload API の wrapper
- browser direct-to-storage upload orchestration
- arbitrary multipart passthrough
- multipart parser を public low-level package として公開すること

これらは必要になった時に、この request body / streaming architecture の上へ別機能として追加する。

## 実装時に変更してはいけない境界

細部の型名・private helper・ファイル分割は実装上の理由で調整してよいが、以下は新しい ADR なしに変更しない。

- `@loutrejs/loutre` は multipart を知らない
- `@loutrejs/multipart` は外部 parser runtime dependency を持たない
- request body decode は `validate.body` より前に行わない
- file part 全体を buffer してから streaming API として公開しない
- body resource limit は有限にする
- multipart array は有限 `max` を必須にする
- Client encode / Server decode / OpenAPI は同じ body Contract を source of truth とする
- storage concern を multipart package へ入れない
