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

request body は `Content-Type` を明示して宣言する。

```ts
request: {
  body: {
    contentType: 'application/json',
    schema: CreateUser,
  },
}
```

従来の `body: schema` 形式は削除する。これは意図した破壊的変更とする。

プロパティ名は `mediaType` ではなく `contentType` とする。OpenAPI の `content` map の key は media type だが、Loutre の Contract が宣言しているものは HTTP request の `Content-Type` だからである。利用側 API では HTTP の概念をそのまま名前に使う。

宣言した `contentType` は runtime decode と OpenAPI 生成の両方で共有する。body を持つ request の `Content-Type` が宣言値と一致しない場合、HTTP runtime は `415 Unsupported Media Type` を返す。

これにより、実際の HTTP runtime contract と生成される API description の乖離を防ぐ。

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
- request body は宣言された `contentType` と Standard JSON Schema の input schema を使う
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
- Content-Type を推測したり、未対応 schema を `{}` へ置き換えたりすること
- HTTP Contract に無制限な `openapi: { ... }` escape hatch を追加すること

## Follow-up

Authentication Layer は将来的に serializable な security metadata を Graph layer attributes として公開できるようにする。これにより、HTTP Contract 側へ認証定義を重複させず OpenAPI security scheme を推論できるようにする。
