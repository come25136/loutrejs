# Nested Contract Auth Example

This example shows HTTP Contract composition where authentication belongs to a parent branch instead of each child route.

`ProfileContract` defines only the profile endpoint. `AppContract` mounts it below `/api/me`, adds the authentication Layer to that parent branch, and declares the inherited `unauthorized` response there.

The Controller binds to the resolved leaf:

```ts
contract: AppContract.http.api.me.profile
```

Because that resolved leaf includes the ancestor pipeline, `ctx.currentUser` is inferred from the Context Key provided by the parent authentication Layer. The example keeps an explicit assignment in the Controller so TypeScript verifies that relationship:

```ts
const currentUser: User = ctx.currentUser
```

From this example directory, start the application with:

```sh
npm run dev
```

A request without credentials is rejected by the parent branch:

```sh
curl -i http://127.0.0.1:3003/api/me/profile
```

Use the example credentials to reach the child Controller:

```sh
curl -i -u loutre:otter http://127.0.0.1:3003/api/me/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

These credentials are for demonstration only.

To validate the Application Graph, types, and behavior, run:

```sh
npm run check
npm run typecheck
npm test
```
