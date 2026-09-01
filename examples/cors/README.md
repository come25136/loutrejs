# CORS Example

Add `validate.cors()` to Loutre's HTTP Pipeline to serve an API that can be called from a different browser origin.

Declare CORS before request body, query, header, and other validation Layers. There is no need to wrap it in a child Pipeline.

You also do not need to define a separate `OPTIONS` procedure. Preflight requests are handled at the HTTP application boundary using the target route's CORS policy, before they reach the Controller.

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

If every origin is allowed without additional restrictions, `validate.cors()` is enough.

To apply the same CORS policy to every route, create and reuse a shared Pipeline helper in your application instead of adding global CORS configuration to the framework.

## Run

From this example directory, start the application with:

```sh
npm run dev
```

## Preflight

The following request is equivalent to a browser preflight request:

```sh
curl -i -X OPTIONS http://127.0.0.1:3000/messages \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

The response is `204 No Content` and includes headers such as:

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

The normal response also includes CORS headers:

```text
HTTP/1.1 201 Created
access-control-allow-origin: http://localhost:5173
access-control-expose-headers: x-request-id
x-request-id: cors-example
```

The browser can call the endpoint with a normal `fetch` request:

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

To validate only the Application Graph and types, run:

```sh
npm run check
npm run typecheck
```
