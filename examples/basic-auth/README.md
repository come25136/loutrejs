# Basic Auth Example

Protect `GET /profile` with HTTP Basic authentication. This example uses the `defineBasicAuth()` Layer, injects a `UserRepository` into its factory, contributes the authenticated user to `ctx.state`, short-circuits authentication failures, and returns a `WWW-Authenticate` challenge.

From this example directory, start the application with:

```sh
npm run dev
```

A request without credentials returns HTTP 401:

```sh
curl -i http://127.0.0.1:3001/profile
```

Opening `http://127.0.0.1:3001/profile` directly in a browser displays the browser's Basic authentication dialog.

Use the example credentials `loutre:otter` to retrieve the profile:

```sh
curl -i -u loutre:otter http://127.0.0.1:3001/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

These credentials are for demonstration only. In a real application, do not store plaintext passwords in source code. Use a secret store and a secure password verification mechanism instead.

To validate the Application Graph, types, and behavior, run:

```sh
npm run check
npm run typecheck
npm test
```
