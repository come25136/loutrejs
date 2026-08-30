# CORSサンプル

LoutreのHTTP Pipelineへ`validate.cors()`を組み込み、ブラウザから別OriginのAPIを呼び出すサンプルです。

CORSはrequest body/query/headerなどのvalidationより前に宣言します。子Pipelineで囲う必要はありません。

`OPTIONS` procedureを別途定義する必要もありません。preflightは対象routeのCORS policyを使ってHTTP application境界で処理され、Controllerまでは到達しません。

```ts
http.route({
  method: 'POST',
  path: '/messages',
  request: {
    body: CreateMessageBody,
  },
  responses: {
    created: {
      status: 201,
      body: Message,
    },
  },
  pipeline: [
    validate.cors({
      origin: ['http://localhost:5173'],
      allowMethods: ['POST'],
      allowHeaders: ['content-type'],
      exposeHeaders: ['x-request-id'],
      maxAge: 600,
    }),
    validate.body,
    http.controller,
  ],
})
```

制限なしで全Originを許可するだけなら`validate.cors()`で十分です。

全routeへ同じCORS policyを適用したい場合は、framework側にglobal CORS設定を増やすのではなく、アプリ側で共通Pipeline helperを作って再利用できます。

## 起動

リポジトリルートで依存関係をインストールしたあと、次のコマンドで起動します。

```sh
npm run dev --workspace @loutrejs/example-cors
```

## Preflight

ブラウザが送るpreflight相当のリクエストは次の通りです。

```sh
curl -i -X OPTIONS http://127.0.0.1:3000/messages \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

レスポンスは`204 No Content`になり、主に次のheaderが付きます。

```text
access-control-allow-origin: http://localhost:5173
access-control-allow-methods: POST
access-control-allow-headers: content-type
access-control-max-age: 600
```

## Actual request

```sh
curl -i -X POST http://127.0.0.1:3000/messages \
  -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  --data '{"text":"Hello from browser"}'
```

通常のresponseにもCORS headerが付与されます。

```text
HTTP/1.1 201 Created
access-control-allow-origin: http://localhost:5173
access-control-expose-headers: x-request-id
x-request-id: cors-example
```

ブラウザ側は普通の`fetch`で呼び出せます。

```ts
const response = await fetch('http://127.0.0.1:3000/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({ text: 'Hello from browser' }),
})

console.log(await response.json())
```

Application Graphと型だけを検証する場合は、次のコマンドを実行します。

```sh
npm run check --workspace @loutrejs/example-cors
npm run typecheck --workspace @loutrejs/example-cors
```
