# Nested Contract Auth Example

This example shows HTTP Contract reuse where authentication is applied while composing an application-level Contract.

`ProfileContract` defines the profile endpoint. `AppContract` reuses `ProfileContract.routes.profile`, prefixes the path with `/api/me`, adds the authentication middleware, and declares the inherited `unauthorized` response.

```ts
const profile = ProfileContract.routes.profile

export const AppContract = http.contract({
  profile: {
    method: profile.method,
    path: `/api/me${profile.path}`,
    responses: {
      ok: profile.responses.ok,
      unauthorized: {
        status: 401,
        body: z.object({ error: z.string() }),
        headers: z.object({ 'www-authenticate': z.string() }),
      },
    },
    middlewares: [authentication],
  },
})
```

The Controller binds to `AppContract`. Because the route includes the authentication middleware, `ctx.state.currentUser` is inferred from the middleware state contribution. The example keeps an explicit assignment so TypeScript verifies that relationship:

```ts
const currentUser: User = ctx.state.currentUser
```

From this example directory, start the application with:

```sh
npm run dev
```

A request without credentials is rejected by the authentication middleware:

```sh
curl -i http://127.0.0.1:3003/api/me/profile
```

Use the example credentials to reach the Controller:

```sh
curl -i -u loutre:otter http://127.0.0.1:3003/api/me/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

These credentials are for demonstration only.

To validate the Application Model, types, and behavior, run:

```sh
npm run check
npm run typecheck
npm test
```
