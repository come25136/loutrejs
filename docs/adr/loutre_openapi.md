# Loutre OpenAPI 生成

ステータス: Accepted

## 決定

Loutre は、実行可能な HTTP Contract から OpenAPI 3.2.0 ドキュメントを生成する。

どの HTTP Procedure が実行可能かは Application Graph が決定する。一方、method、path、request schema、response schema、Content-Type、streaming interaction といった HTTP wire-level の情報については、具体的な HTTP Contract を source of truth とする。実行時の schema object 自体は serializable な Graph IR には埋め込まない。

公開 API は `@loutrejs/loutre/openapi` から提供する。

```ts
import { generateOpenApi } from '@loutrejs/loutre/openapi'

const document = generateOpenApi(application, {
  info: {
    title: 'Example API',
    version: '1.0.0',
  },
})
```

CLI からも同じ projection を利用できる。

```sh
loutre openapi --entry src/application.ts
loutre openapi --entry src/application.ts --output openapi.json
```

## OpenAPI 3.2 を採用する理由

OpenAPI 3.2 なら、Loutre の HTTP Contract を互換用の近似表現へ落とさずに表現できる。

- custom HTTP method は `additionalOperations` で表現できる
- object-shaped query contract は `querystring` parameter として表現できる
- server streaming は `itemSchema` で表現できる
- JSON Schema は 2020-12 dialect を利用できる

OpenAPI 3.1 互換が必要になった場合は、将来明示的な down-level target として追加する。Loutre の canonical な生成形式は 3.2 とする。

## Schema capability

runtime validation が要求するのは引き続き Standard Schema のみとする。

OpenAPI 生成時には、それに加えて schema が Standard JSON Schema を実装している必要がある。request schema には `jsonSchema.input()`、response schema には `jsonSchema.output()` を使う。これにより、wire input と runtime output が transform によって異なる場合でも正しく記述できる。

Loutre 独自の Zod 専用 OpenAPI DSL は追加しない。Standard JSON Schema を生成できない schema が含まれている場合は、不正確な OpenAPI を出力するのではなく生成を失敗させる。

## HTTP request body Contract

request bodyのschemaは`request.body`へ直接宣言する。bodyの表現を決める`Content-Type`はbody固有metadataとして二重管理せず、HTTP headerとして`request.headers` schemaへ宣言する。

```ts
request: {
  headers: z.object({
    'content-type': z.enum([
      'application/json',
      'text/plain',
    ]),
  }),
  body: z.union([JsonInput, TextInput]),
}
```

旧`body: { contentType, schema }`形式は廃止する。`Content-Type`はwire上のheaderであり、typed client、runtime validation、body decode、OpenAPI projectionが同じheader宣言をsource of truthとして利用する。

bodyを宣言するrequestでは、`request.headers`のinput/output型がrequiredな`content-type: string`を持つ必要がある。`validate.body`は`validate.headers`より後に置く。runtimeはheader validation時に`Content-Type`から`charset`やmultipart `boundary`などのparameterを除いてmedia typeへ正規化し、その値をheader schemaへ渡す。header validation後に`validate.body`へ到達した時点で、実際のmedia typeに応じてbodyをdecodeしてbody schemaを検証する。

`validate.headers` / `validate.body`を置かない場合はraw HTTP handlingとして扱う。`ctx.input.headers`にはparameterを含む元のheader値、`ctx.input.body`には未消費の`ReadableStream`を渡すため、Application側のmultipart parserなどがboundaryを直接利用できる。

1つのProcedureは複数の`Content-Type`を受け入れられる。media typeごとに同じmethod/pathのProcedureを重複定義するのではなく、header schemaのunion/enumとbody schemaのunionでrequest representationを表現する。

OpenAPI生成時は`request.headers`のStandard JSON Schema input projectionから`content-type` propertyを読み、`const`、`enum`、`anyOf`、`oneOf`で有限な文字列集合へ解決できる場合に`requestBody.content`のkeyへ投影する。有限集合へ正確に解決できない場合は生成を失敗させる。`Content-Type`自体は通常のHeader Parameterとして重複出力しない。

## Operation metadata

HTTP Contract は transport に関係するドキュメント metadata を宣言できる。

```ts
http({
  method: 'GET',
  path: '/users/{id}',
  summary: 'ユーザー取得',
  description: 'IDで指定したユーザーを返す。',
  tags: ['Users'],
  deprecated: false,
  // ...
})
```

response variant は `description` を宣言できる。

名前付き Contract の `operationId` は `<contract>.<procedure>` から安定して生成する。anonymous Contract では、順序依存の人工的な ID を生成せず `operationId` 自体を省略する。

## Projection ルール

- path parameter は `request.params` から生成し、常に `required: true` とする
- query schema は OpenAPI 3.2 の `in: querystring` parameter として出力する
- header schema は top-level `properties` を持つ object JSON Schema へ変換可能である必要があり、各 property を Parameter Object へ投影する
- request bodyは`request.headers`の`content-type`有限集合を`requestBody.content`へ投影し、bodyのStandard JSON Schema input schemaを各media typeで共有する
- unary response は `application/json` と Standard JSON Schema の output schema を使う
- 同じ HTTP status を持つ複数の response variant は `oneOf` にまとめる
- server-stream response は `text/event-stream` とし、event payload を `itemSchema` で表現する
- custom HTTP method は `additionalOperations` へ出力する

## 厳密性

実行可能な Contract を正確に表現できない場合、情報を黙って欠落させるのではなく OpenAPI 生成を失敗させる。

代表例:

- Standard JSON Schema を実装していない schema
- JSON Schema 変換の失敗
- named header として表現できない request / response header schema
- 同じ HTTP status に streaming と non-streaming の互換性がない variant が混在している場合
- `operationId` の衝突

したがって生成成功は、対応している OpenAPI surface の範囲内で、出力ドキュメントが Loutre HTTP Contract の忠実な projection であることを意味する。

## Non-goals

- 実行時の schema object を serializable Application Graph IR に埋め込むこと
- Zod 専用 OpenAPI adapter を追加すること
- CORS preflight を application operation として生成すること
- Content-Typeを推測したり、有限集合へ解決できないheader schemaや未対応schemaを`{}`へ置き換えたりすること
- HTTP Contract に無制限な `openapi: { ... }` escape hatch を追加すること

## Follow-up

Authentication Layer は将来的に serializable な security metadata を Graph layer attributes として公開できるようにする。これにより、HTTP Contract 側へ認証定義を重複させず OpenAPI security scheme を推論できるようにする。
