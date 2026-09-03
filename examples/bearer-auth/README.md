# Bearer Auth Example

Protect `GET /profile` with Loutre's built-in `defineBearerAuth()` Layer. The authentication factory injects a `UserRepository`, validates the bearer token, contributes the authenticated user to `ctx.state`, and short-circuits authentication failures with a `WWW-Authenticate` challenge.

From this example directory, start the application with:

```sh
npm run dev
```

A request without authentication returns HTTP 401:

```sh
curl -i http://127.0.0.1:3002/profile
```

Use the example token to retrieve the profile:

```sh
curl -i -H 'Authorization: Bearer loutre-token' http://127.0.0.1:3002/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

This token is for demonstration only. In a real application, validate properties such as the signature, issuer, audience, and expiration, and never store tokens or private keys in source code.

To validate the types, Application Graph, and behavior, run:

```sh
npm run typecheck
npm run check
npm test
```
