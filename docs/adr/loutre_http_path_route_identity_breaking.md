# Loutre HTTP Path / Params / Route Identity 再設計 実装指示

## 前提

対象: `come25136/loutrejs` の `develop` ブランチ最新状態。

この変更では **後方互換性を考慮しない**。

既存挙動を維持するための legacy branch、fallback、compatibility shim は追加しないこと。

今回の目的は HTTP path / path params / params validation / route identity / route dispatch を一度きれいに設計し直すこと。

---

# 1. 設計原則

今回の変更では以下を source of truth とする。

```txt
path = raw params の構造の source of truth
params schema map = 各 path param の validation / transformation
pipeline = refinement が発生する位置の source of truth
dispatchKey = protocol が提供する dispatch identity
```

Controller までの型の流れ:

```txt
HTTP Router
    ↓
RawPathParams<Path>
    ↓
Pipeline
    ↓
validate.params
    ↓
ValidatedPathParams<ParamsSchemas>
    ↓
Controller
```

重要:

```txt
path params は最初から型付き
```

であり、

```txt
validation が params の構造を定義する
```

のではない。

params の **キー集合は path が決める**。

schema は各 property の値だけを validate / transform / refine する。

---

# 2. request.params の API を破壊的変更する

従来の、

```ts
request: {
  params: z.object({
    id: z.coerce.number(),
  }),
}
```

は廃止する。

新しい API:

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

複数 param:

```ts
http({
  method: 'GET',
  path: '/users/{userId}/posts/{postId}',

  request: {
    params: {
      userId: z.coerce.number(),
      postId: z.string(),
    },
  },

  // ...
})
```

`request.params` は object schema ではなく、

```ts
Readonly<Record<string, StandardSchemaV1>>
```

相当の **schema map** とする。

ただし実際の型制約では単なる `Record<string, ...>` に widening せず、literal key を保持すること。

Zod 固有 API には依存しない。

---

# 3. なぜ plain object schema map にするか

HTTP path がすでに、

```txt
/users/{userId}/posts/{postId}
```

から、

```ts
{
  userId: string
  postId: string
}
```

という構造を完全に決定している。

そのため、

```ts
z.object({
  userId: ...,
  postId: ...,
})
```

で同じ object 構造をもう一度宣言させない。

新設計では、

```txt
path
  ↓
param names
  ↓
plain schema map
  ↓
property-wise validation
  ↓
mapped SchemaOutput
```

という一本道にする。

Standard Schema の object schema 内部構造を introspection する設計にはしない。

---

# 4. path parameter は schema なしでも型付きにする

以下:

```ts
http({
  method: 'GET',
  path: '/users/{id}',
  responses: {
    found: {
      status: 200,
      body: User,
    },
  },
  pipeline: [http.controller],
})
```

Controller:

```ts
ctx.params.id
// string
```

`validate.params` がないから `unknown`、という従来 semantics は廃止する。

複数 param:

```txt
/users/{userId}/posts/{postId}
```

なら、

```ts
ctx.params
// {
//   readonly userId: string
//   readonly postId: string
// }
```

path param が存在しない場合:

```ts
ctx.params
// {}
```

相当。

存在しない key へのアクセスは compile error にする。

---

# 5. request.params を宣言しなくてもよい

validation / transformation が不要なら `request.params` 自体を省略できる。

```ts
http({
  method: 'GET',
  path: '/users/{id}',
  pipeline: [http.controller],
})
```

で、

```ts
ctx.params.id
// string
```

となる。

単なる path param 取得のために、

```ts
params: {
  id: z.string(),
}
```

を書く必要はない。

schema map は値へ追加制約や変換が必要な場合だけ使う。

---

# 6. validate.params は refinement としてのみ扱う

例:

```ts
http({
  method: 'GET',
  path: '/users/{id}',

  request: {
    params: {
      id: z.coerce.number(),
    },
  },

  responses: {
    found: {
      status: 200,
      body: User,
    },
  },

  pipeline: [someLayer, validate.params, anotherLayer, http.controller],
})
```

型の流れ:

```txt
someLayer
  ctx.params.id: string

validate.params

anotherLayer
  ctx.params.id: number

http.controller
  ctx.params.id: number
```

`request.params` を宣言しただけでは型を変えない。

例えば:

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
},

pipeline: [
  http.controller,
]
```

なら:

```ts
ctx.params.id
// string
```

Pipeline 上で `validate.params` を通過した時点で初めて schema output に refine する。

---

# 7. validate.params の自動実行はしない

以下のような自動挙動は実装しない。

```txt
request.params が存在する
→ 自動validation
```

明示的に:

```ts
pipeline: [auth, validate.params, rateLimit, http.controller]
```

と書かせる。

これにより、

```txt
auth
  raw params

validate.params
  refinement boundary

rateLimit
  validated params
```

という Pipeline semantics を維持する。

---

# 8. schema map のキーは path params と完全一致させる

path:

```txt
/users/{id}/posts/{postId}
```

なら、`request.params` を宣言する場合のキー集合は必ず:

```txt
id
postId
```

と完全一致すること。

合法:

```ts
request: {
  params: {
    id: z.coerce.number(),
    postId: z.string(),
  },
}
```

不正:

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

`postId` が欠けている。

不正:

```ts
request: {
  params: {
    id: z.coerce.number(),
    postId: z.string(),
    organizationId: z.string(),
  },
}
```

`organizationId` は path に存在しない。

不正:

```ts
path: '/users/{id}',

request: {
  params: {
    userId: z.string(),
  },
}
```

path と schema map の名前が一致しない。

型レベルでは概念的に:

```ts
keyof ParamsSchemas
```

と、

```ts
PathParamNames<Path>
```

が双方向に一致することを保証する。

---

# 9. 各 params schema の input は raw string を受け取れる必要がある

Router が生成する各 path param value は必ず `string`。

したがって各 property schema について、

```ts
string extends SchemaInput<Schema>
```

相当を compile-time で確認する。

例えば:

```ts
request: {
  params: {
    id: z.number(),
  },
}
```

は reject。

`z.number()` は raw `"123"` をそのまま入力として受け取れないため。

一方:

```ts
request: {
  params: {
    id: z.string(),
  },
}
```

は合法。

また:

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

も、その Standard Schema input 型が raw string を受け取れるなら合法。

実装は Standard Schema の `InferInput` を使い、Zod 固有型へ依存しない。

---

# 10. validation 後の params 型は property ごとの SchemaOutput から作る

schema map:

```ts
request: {
  params: {
    id: z.coerce.number(),
    slug: z.string(),
  },
}
```

から:

```ts
type ValidatedParams = {
  readonly id: number
  readonly slug: string
}
```

相当を生成する。

概念:

```ts
type ValidatedPathParams<TSchemas extends Record<string, StandardSchemaV1>> = {
  readonly [K in keyof TSchemas]: SchemaOutput<TSchemas[K]>
}
```

object schema 全体の output を推論する必要はない。

各 schema の `SchemaOutput` を mapped type で組み立てる。

---

# 11. object 全体の transform / cross-field validation は params schema の責務にしない

plain object schema map へ変更するため、以下のような object 全体 validation は `request.params` では提供しない。

```ts
z.object({
  start: z.coerce.number(),
  end: z.coerce.number(),
}).refine(({ start, end }) => start < end)
```

また以下のような object 全体 transform も `request.params` の責務にしない。

```txt
{ first, last }
    ↓
{ fullName }
```

path params は独立した routing input として扱う。

複数 param 間の業務上の関係:

```txt
start < end
userId と postId の組み合わせが存在する
tenantId と resourceId の関係が正しい
```

などは Layer / domain validation で扱う。

`request.params` の責務は:

```txt
各 path param の decode 後 string
    ↓
個別 validation / transformation
```

まで。

---

# 12. literal schema を routing に使わない

例えば:

```ts
path: '/users/{type}',

request: {
  params: {
    type: z.literal('admin'),
  },
}
```

自体を validation として禁止する必要はない。

ただし route identity / specificity には schema の内容を一切使用しない。

もし固定 route を表現したいなら:

```txt
/users/admin
```

と path 自体へ書く。

以下:

```txt
/users/{type}
```

は schema が `z.literal('admin')` でも routing 上は常に dynamic param route。

route identity は:

```txt
/users/{}
```

のまま。

schema constraint によって route dispatch を分岐させてはいけない。

---

# 13. SchemaInput を core に追加する

現在の `SchemaOutput` と対になる utility:

```ts
export type SchemaInput<Schema> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<Schema>
  : never
```

を追加する。

配置:

```txt
packages/core/src/schema.ts
```

`@loutrejs/loutre` から public export する。

用途は主に各 property schema が raw path string を入力として受け取れるかの型検査。

---

# 14. property-wise runtime validation

`validate.params` 実行時は object 全体を1個の Standard Schema に渡さない。

schema map の各 property を個別に validate する。

概念:

```ts
const output = {}

for (const [name, schema] of Object.entries(paramsSchemas)) {
  output[name] = await validateSchema(schema, context.params[name])
}

context.params = output
```

実際は型・immutability・error handling 等を既存設計に合わせること。

schema map の key と path param の key は definition 時に一致保証されている前提でよい。

---

# 15. validation issue の path を Loutre 側で prefix する

property schema 単体:

```ts
z.coerce.number()
```

は、自分が `id` property 用であることを知らない。

そのため validation failure の issue path は Loutre 側で param 名を prefix する。

例えば `id` の schema が返した issue:

```ts
{
  message: '...',
  path: [...]
}
```

を HTTP params 全体の issue として扱うとき、概念的に:

```ts
{
  message: '...',
  path: ['id', ...originalPath],
}
```

とする。

元の `issue.path` が undefined なら:

```ts
;['id']
```

にする。

Standard Schema の `Issue.path` semantics を壊さないこと。

---

# 16. HTTP path grammar を Freeze する

v0.1 で正式サポート:

```txt
/
/users
/users/{id}
/users/{userId}/posts/{postId}
```

path param は segment 全体を占有する。

概念 grammar:

```txt
Path      := "/"
          | "/" Segment ("/" Segment)*

Segment   := StaticSegment
          | ParamSegment

ParamSegment := "{" ParamName "}"

ParamName := [A-Za-z_][A-Za-z0-9_]*
```

有効:

```txt
{id}
{x}
{_}
{userId}
{post_id}
{id2}
```

無効:

```txt
{}
{2id}
{user-id}
{id?}
{*path}
```

---

# 17. optional / wildcard は実装しない

以下は invalid:

```txt
/users/{id?}
/files/{*path}
/files/{path*}
/users/{id:\d+}
/users/foo-{id}
```

`{id?}` や `{*path}` を通常 param 名として扱わない。

将来正式 syntax として追加可能にするため、今は reserved invalid syntax として reject する。

---

# 18. path 全体の制約

compile-time / runtime の両方で reject:

```txt
/users/{id?}
/files/{*path}
/users/{id}/{id}
/users/{}
/users/{2id}
/users/{user-id}
/users/foo-{id}
/users//posts
/users/
/users?foo=bar
/users#foo
```

root:

```txt
/
```

は有効。

trailing slash alias は実装しない。

```txt
/users/
```

自体を invalid にする。

---

# 19. HTTP path parser を一本化する

`packages/http/src/path.ts` を新設することを推奨。

HTTP path の runtime logic を一箇所に集約する。

同じ parsed representation から:

```txt
parse
 ├─ validation
 ├─ matching
 ├─ params extraction
 ├─ normalization
 └─ specificity
```

を生成する。

概念:

```ts
type HttpPathSegment =
  | {
      readonly kind: 'static'
      readonly value: string
    }
  | {
      readonly kind: 'param'
      readonly name: string
    }
```

例:

```ts
parseHttpPath('/users/{id}')
```

↓

```ts
;[
  { kind: 'static', value: 'users' },
  { kind: 'param', name: 'id' },
]
```

---

# 20. regex ベース compilePath は廃止する

path 全体を regex へ変換する方式は残さない。

v0.1 grammar は単純なので segment matcher にする。

route:

```txt
/users/{id}
```

request:

```txt
/users/123
```

なら:

```txt
users === users
123   → id
```

param value には:

```ts
decodeURIComponent(...)
```

を適用。

decode 失敗は既存 HTTP decode error semantics に従い 400。

---

# 21. TypeScript 側にも同じ path semantics を実装する

template literal type で:

```ts
type PathParamNames<TPath extends string> = ...
```

を実装。

例:

```ts
type A = PathParamNames<'/users/{id}'>
// 'id'

type B = PathParamNames<'/users/{userId}/posts/{postId}'>
// 'userId' | 'postId'

type C = PathParamNames<'/users'>
// never
```

さらに:

```ts
type RawPathParams<TPath extends string> = ...
```

例:

```ts
type A = RawPathParams<'/users/{id}'>

// {
//   readonly id: string
// }
```

runtime parser と type-level semantics を一致させる。

---

# 22. path / method は literal 必須

以下の widened string は reject:

```ts
declare const path: string

http({
  method: 'GET',
  path,
})
```

合法:

```ts
const path = '/users/{id}' as const

http({
  method: 'GET',
  path,
})
```

method も literal を要求する。

dispatch identity を静的に生成できない definition は認めない。

---

# 23. params の型決定

validation 前:

```ts
type ParamsBeforeValidation<TDefinition> = RawPathParams<TDefinition['path']>
```

validation 後、schema map がある場合:

```ts
type ParamsAfterValidation<TDefinition> = ValidatedPathParams<
  TDefinition['request']['params']
>
```

Pipeline analysis で:

```ts
HasValidationBeforeTerminal<TDefinition['pipeline'], 'params'>
```

が true の場合のみ validated type を採用。

schema map が存在しない状態で `validate.params` を置く場合の扱いは、既存 validation layer semantics と揃えて明示的に決めること。

推奨:

```txt
schema がない validate.params は definition error
```

とする。

validation layer が no-op になるより、宣言ミスを早く検出する方を優先する。

query / headers / body は今回変更しない。

---

# 24. ProtocolDescriptor を破壊的変更する

`dispatchKey` を optional metadata にしない。

ProtocolDescriptor の正式概念にする。

例:

```ts
export interface ProtocolDescriptor<
  TName extends string,
  TContext,
  TResult,
  TDispatchKey extends string | null,
> {
  readonly kind: 'protocol'
  readonly protocol: TName
  readonly interaction?: InteractionMode
  readonly dispatchKey: TDispatchKey

  readonly '~context'?: TContext
  readonly '~result'?: TResult
}
```

互換 shim は不要。

dispatch identity を持たない protocol:

```ts
dispatchKey: null
```

HTTP:

```ts
dispatchKey: 'http:GET:/users/{}'
```

---

# 25. HTTP dispatchKey

route identity:

```txt
uppercase(method)
+
normalized path
```

param 名は identity に含めない。

```txt
GET /users/{id}
GET /users/{userId}
```

は同じ route。

normalization:

```txt
/users/{id}
→ /users/{}

/users/{userId}
→ /users/{}

/users/{id}/posts/{postId}
→ /users/{}/posts/{}
```

root:

```txt
/
→ /
```

dispatch key:

```txt
http:GET:/users/{}
```

type-level:

```ts
type HttpDispatchKey<TDefinition> =
  `http:${Uppercase<TDefinition['method']>}:${NormalizeHttpPath<TDefinition['path']>}`
```

runtime でも同じ値を生成する。

---

# 26. dispatchKey は protocol-neutral

core / graph は HTTP path grammar を知らない。

責務:

```txt
core
  ProtocolDescriptor
  dispatchKey concept
  Contract 内 uniqueness
  SchemaInput / SchemaOutput

http
  path grammar
  params schema map
  property-wise validation
  normalization
  HttpDispatchKey
  matcher / specificity

graph
  active target
  dispatchKey uniqueness
  diagnostic
```

将来:

```txt
message-port:user.created
rpc:UserService/GetUser
```

等でも同じ infrastructure を利用可能にする。

---

# 27. 同一 Contract 内 duplicate を compile-time reject

全 procedure / protocol の dispatchKey を収集し、同じ string が複数存在した場合 reject。

```txt
GET /users/{id}
GET /users/{userId}
```

は duplicate。

```txt
GET  /users/{id}
POST /users/{id}
```

は合法。

---

# 28. 同一 Contract 内 duplicate を runtime reject

unsafe cast / any / JavaScript からも守る。

`contract()` runtime でも dispatchKey uniqueness を検証。

例:

```txt
Duplicate protocol dispatch key "http:GET:/users/{}"
between UsersContract.first.http and UsersContract.second.http
```

---

# 29. Application Graph 全体でも duplicate reject

別 Contract 間は Graph compile 時に検出。

active target に:

```ts
dispatchKey: string | null
```

を保持。

`dispatchKey !== null` の target の uniqueness を検査する。

HTTP 専用 logic は graph に入れない。

generic diagnostic 例:

```txt
LUTRE_PROTOCOL_001
Duplicate protocol dispatch key "http:GET:/users/{}":
UsersContract.get.http
LegacyUsersContract.get.http
```

`assertValidCompilation()` により application 起動前に失敗すること。

---

# 30. route dispatch は登録順に依存させない

以下:

```txt
GET /users/{id}
GET /users/me
```

に:

```txt
GET /users/me
```

が来た場合、必ず static route:

```txt
/users/me
```

を選ぶ。

`{ id: "me" }` に吸わせない。

---

# 31. route specificity

segment を左から比較:

```txt
static > param
```

例:

```txt
/a/{x}/c
/a/b/{y}
```

request:

```txt
/a/b/c
```

では:

```txt
/a/b/{y}
```

を選ぶ。

登録順非依存。

同一 static/param shape は dispatchKey duplicate で禁止されるため、同priorityの曖昧routeは存在させない。

---

# 32. Router は parsed path を route collection 時に生成する

request ごとに route pattern を parse しない。

概念:

```ts
interface HttpRoute {
  readonly method: string
  readonly path: string
  readonly segments: readonly HttpPathSegment[]
  readonly dispatchKey: string
  readonly protocol: HttpProtocol
  readonly implementation: ImplementationDescriptor
  readonly procedure: string
}
```

route collection 後に deterministic sort または同等構造で dispatch。

trie 全面移行は必須ではない。

保証すべきもの:

```txt
registration order independent
static > param
```

---

# 33. runtime path validation

`http()` 作成時に runtime validation。

TypeScript を回避しても invalid path を受け入れない。

最低限:

```txt
invalid path
invalid param name
duplicate param name
unsupported path syntax
```

を判別可能にする。

error wording の過剰設計は不要。

---

# 34. type tests

専用 file 推奨:

```txt
tests/types/http-path.test-d.ts
```

最低限:

## raw params

```txt
/users/{id}
→ ctx.params.id: string
```

```txt
/users/{userId}/posts/{postId}
→ userId: string
→ postId: string
```

## schema map refinement

```ts
params: {
  id: z.coerce.number(),
}
```

validation 前:

```txt
id: string
```

`validate.params` 後:

```txt
id: number
```

## schema 宣言だけでは refine しない

```txt
request.params exists
pipeline = [http.controller]

→ id: string
```

## exact key matching

reject:

```txt
path: /users/{id}
params: { userId: ... }
```

reject:

```txt
path: /users/{id}/{postId}
params: { id: ... }
```

reject:

```txt
path: /users/{id}
params: { id: ..., extra: ... }
```

## schema input compatibility

reject schema whose Standard Schema input cannot accept string.

accept schemas whose input supports raw string and whose output transforms to another type.

## invalid path

全て `@ts-expect-error`:

```txt
{id?}
{*rest}
{}
{2id}
{user-id}
duplicate param
inline param
trailing slash
double slash
query
fragment
widened string path
```

## duplicate route

reject:

```txt
GET /users/{id}
GET /users/{userId}
```

accept:

```txt
GET  /users/{id}
POST /users/{id}
```

---

# 35. runtime params tests

最低限:

## basic

```txt
GET /users/123
→ params.id === "123"
```

## multiple params

```txt
/users/123/posts/456
→ {
  userId: "123",
  postId: "456"
}
```

## property-wise transform

schema map:

```ts
{
  userId: z.coerce.number(),
  postId: z.string(),
}
```

`validate.params` 後:

```ts
{
  userId: 123,
  postId: '456',
}
```

## property-wise issue path

`userId` schema validation error の issue path が:

```txt
userId
```

から始まること。

nested issue.path がある場合も param key が先頭へ prefix されること。

## percent decoding

decode 成功を確認。

invalid percent encoding は 400。

---

# 36. runtime route tests

## static priority

route registration order を:

```txt
/users/{id}
/users/me
```

にしても `/users/me` が static route。

逆順でも同じ。

## deeper specificity

```txt
/a/{x}/c
/a/b/{y}
```

へ `/a/b/c`:

```txt
/a/b/{y}
```

を選ぶ。

## method separation

```txt
GET /users/{id}
POST /users/{id}
```

が別 route として動作。

---

# 37. Contract duplicate runtime test

unsafe cast 等で compile-time 制約を迂回し、同じ dispatchKey を含む Contract を作った場合 runtime throw。

compile-time test だけで済ませない。

---

# 38. Graph duplicate test

別 Contract:

```txt
GET /users/{id}
GET /users/{userId}
```

を別 module / binding として同一 Application に入れる。

`compileApplication()` が duplicate dispatch diagnostic。

`assertValidCompilation()` が失敗。

method 違いは合法。

---

# 39. type/runtime parity test

以下の semantics が type / runtime で一致:

```txt
GET /users/{id}
get /users/{userId}
GET /users/{id}/posts/{postId}
/
```

確認:

```txt
method uppercase
param name normalization
root path
multiple params
```

---

# 40. public API

public に追加:

```ts
SchemaInput
```

当面 internal:

```txt
PathParamNames
RawPathParams
ValidatedPathParams
NormalizeHttpPath
HttpPathSegment
parseHttpPath
```

public API を不要に増やさない。

型テストは可能な限り public API:

```txt
http
contract
ControllerOf
ContextOf
```

越しに行う。

---

# 41. documentation

以下を明記。

## raw params

```ts
path: '/users/{id}'
```

だけで:

```ts
ctx.params.id
// string
```

## params schema map

```ts
request: {
  params: {
    id: z.coerce.number(),
  },
}
```

`request.params` は object schema ではなく property schema map。

## validation boundary

`validate.params` 前:

```txt
ctx.params.id: string
```

後:

```txt
ctx.params.id: SchemaOutput<typeof params.id>
```

## no cross-field validation

params schema map は property-wise validation のみ。

複数 params 間の business validation は Layer / domain で行う。

## route identity

```txt
uppercase(method)
+
normalized path
```

param 名や schema 内容は route identity に含めない。

## duplicate

同一 Contract:

```txt
compile-time
+
contract() runtime
```

別 Contract:

```txt
Application Graph compile
```

## priority

```txt
static > param
```

registration order independent。

---

# 42. 削除してよいもの

後方互換不要。

新設計と衝突する以下は削除してよい。

```txt
request.params: StandardSchemaV1 object schema
params が validate.params 前は unknown
object schema output から path keys を推測する logic
object schema input と RawPathParams 全体を比較する logic
regex ベース compilePath
route first-match 登録順 semantics
dispatchKey optional fallback
legacy ProtocolDescriptor shape support
```

compatibility layer は追加しない。

---

# 43. 変更範囲

今回の scope:

```txt
HTTP path grammar
HTTP path parser
raw path params typing
params schema map
property-wise params validation
params refinement
SchemaInput
ProtocolDescriptor dispatchKey
Contract duplicate detection
Graph duplicate detection
route normalization
route specificity
route matching
tests
documentation
```

不要に触らない:

```txt
response
error mapping
streaming
DI
provider
lifecycle
database
message-port semantics
```

scope を広げない。

---

# 44. 実装後に必ず実行するもの

repository の package manager / scripts を確認して最低限:

```txt
format
lint
typecheck
type tests
unit tests
conformance tests
build
```

相当を実行。

失敗を skip しない。

既存 test を削除して green にしない。

仕様変更に伴う正当な期待値変更のみ更新。

---

# 45. 完了条件

以下が全て成立したら完了。

- `request.params: z.object(...)` を廃止
- `request.params` は plain object schema map
- path が params key の唯一の source of truth
- schema なしでも `ctx.params.id` が string
- 複数 path param が型付き
- schema map key と path param key が完全一致
- 各 schema input が raw string を受け取れることを compile-time 検証
- validation 前は raw string
- `validate.params` 後は property ごとの SchemaOutput
- schema 宣言だけでは型が変わらない
- params validation は property-wise
- validation issue path に param key を prefix
- object 全体 transform / cross-field validation を params API から除外
- invalid path を compile-time reject
- invalid path を runtime reject
- optional / wildcard 未対応
- regex ベース matcher 廃止
- segment based matching
- param 名だけ違う route は duplicate
- schema constraint は route identity に影響しない
- 同一 Contract duplicate を compile-time reject
- 同一 Contract duplicate を runtime reject
- 別 Contract duplicate を Graph compile reject
- method 違いは合法
- static route が param route より優先
- route dispatch が登録順非依存
- `dispatchKey` が ProtocolDescriptor の正式概念
- dispatch identity を持たない protocol は `null`
- HTTP 固有知識が core / graph に漏れていない
- `SchemaInput` 追加
- type/runtime normalization 一致
- tests 追加
- 既存 tests green
- documentation 更新

---

# 最終目標形

```ts
http({
  method: 'GET',
  path: '/users/{userId}/posts/{postId}',

  request: {
    params: {
      userId: z.coerce.number(),
      postId: z.string().min(1),
    },
  },

  responses: {
    found: {
      status: 200,
      body: Post,
    },
  },

  pipeline: [authLayer, validate.params, http.controller],
})
```

型の流れ:

```txt
Router
  ↓
{
  userId: string
  postId: string
}
  ↓
authLayer
  userId: string
  postId: string
  ↓
validate.params
  ↓
{
  userId: number
  postId: string
}
  ↓
http.controller
```

route identity:

```txt
GET /users/{userId}/posts/{postId}
        ↓
/users/{}/posts/{}
        ↓
http:GET:/users/{}/posts/{}
```

runtime path representation:

```txt
parseHttpPath()
   │
   ├─ validation
   ├─ matching
   ├─ params extraction
   ├─ normalization
   └─ specificity
```

params validation:

```txt
params schema map
   │
   ├─ userId schema.validate(raw.userId)
   └─ postId schema.validate(raw.postId)
        ↓
mapped validated params
```

設計に迷った場合は以下を最優先する。

```txt
path = params structure の source of truth
params schema map = property-wise refinement
pipeline = refinement boundary
dispatchKey = protocol dispatch identity
```
