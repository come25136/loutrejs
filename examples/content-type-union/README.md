# Content-Type Union Example

同じHTTP Procedureで複数のrequest representationを受け取り、`Content-Type`によって別headerの要件を変える例です。

```ts
headers: z.union([
  z.object({
    'content-type': z.literal('application/json'),
  }),
  z.object({
    'content-type': z.literal('text/plain'),
    'x-custom-header': z.string(),
  }),
])
```

起動:

```sh
npm run dev
```

JSON request:

```sh
curl -sS http://127.0.0.1:3000/messages \
  -H 'content-type: application/json' \
  -d '{"message":"hello from json"}'
```

text requestでは`x-custom-header`が必須です。

```sh
curl -sS http://127.0.0.1:3000/messages \
  -H 'content-type: text/plain' \
  -H 'x-custom-header: text-client' \
  --data-binary 'hello from text'
```

OpenAPI 3.2 documentを生成:

```sh
npm run openapi
```

`openapi.json`では`requestBody.content`に`application/json`と`text/plain`が生成され、標準OpenAPIだけでは表現できないheader unionの相関は`x-loutre-request-headers`に保持されます。
