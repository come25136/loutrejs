# Hello HTTP example

A minimal HTTP API built with Loutre. `GET /{name}` accepts a path parameter and validates it with `validate.params` before the request reaches the Controller.

Install dependencies from the repository root, then start the example:

```sh
npm run dev --workspace @loutrejs/example-hello-http
```

Send a request from another terminal:

```sh
curl http://127.0.0.1:3000/Loutre
```

```json
{ "message": "Hello, Loutre!" }
```

`name` must contain at least two characters. A one-character value returns a validation error:

```sh
curl -i http://127.0.0.1:3000/x
```

To validate only the Application Graph and types, run:

```sh
npm run check --workspace @loutrejs/example-hello-http
npm run typecheck --workspace @loutrejs/example-hello-http
```
