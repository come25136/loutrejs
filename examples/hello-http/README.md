# Hello HTTP Example

A minimal HTTP API built with Loutre. `GET /{name}` accepts a path parameter and validates it with `validate.params` before the request reaches the Controller.

From this example directory, start the application with:

```sh
npm run dev
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
npm run check
npm run typecheck
```
