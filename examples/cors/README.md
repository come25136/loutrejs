# CORS Example

Add `cors()` to an HTTP route's `middlewares` to serve an API that can be called from a different browser origin.

The CORS policy is part of the HTTP Contract. A separate `OPTIONS` route is not required: browser preflight requests are handled by the HTTP Extension from the target route's CORS middleware before the Controller runs.

```ts
const corsMiddleware = cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['POST'],
  allowHeaders: ['content-type'],
  exposeHeaders: ['x-request-id'],
  maxAge: 600,
})

export const MessageContract = http.contract({
  create: {
    method: 'POST',
    path: '/messages',
    request: {
      headers: z.object({
        'content-type': z.literal('application/json'),
      }),
      body: CreateMessageBody,
    },
    responses: {
      created: {
        status: 201,
        body: Message,
        headers: {
          'x-request-id': 'cors-example',
        },
      },
    },
    middlewares: [corsMiddleware],
  },
})
```

If every origin is allowed without additional restrictions, `cors()` with no options is enough.

To apply the same CORS policy to multiple routes, create one middleware and reuse it in each route's `middlewares`.

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

To validate only the Application Model and types, run:

```sh
npm run check
npm run typecheck
```
