# Nested HTTP Contract composition migration

HTTP Contract composition now has an Application-level resolved tree. Feature Contracts can still be defined independently, but server Implementations should bind to the resolved node selected from the Application Contract.

## Before

```ts
const UsersContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/users/{id}',
      responses: { ok: { status: 200, body: UserSchema } },
      pipeline: [http.controller],
    },
  }),
])

const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: () => ({ get: (ctx) => ctx.response.ok({ body: user }) }),
})

defineApplication({ modules: [UsersModule()] })
```

## After

```ts
const UsersContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/users/{id}',
      responses: { ok: { status: 200, body: UserSchema } },
      pipeline: [http.controller],
    },
  }),
])

const AppContract = contract([
  http({
    api: {
      path: '/api',
      routes: UsersContract.http,
    },
  }),
])

const UsersController = implementation({
  name: 'UsersController',
  contract: AppContract.http.api.get,
  protocol: http,
  factory: () => ({ get: (ctx) => ctx.response.ok({ body: user }) }),
})

defineApplication({
  contract: AppContract,
  modules: [UsersModule()],
})
```

The effective route is `GET /api/users/{id}`. Branch `pipeline` wraps descendant pipelines, and branch `responses` are merged into each descendant response set. Duplicate inherited response variant names are rejected instead of being overridden.

Resolved nodes are opaque public objects. Framework metadata such as the internal Contract definition and node identity stays behind Symbols; application code accesses nodes through normal properties such as `AppContract.http.api.get`.

A resolved subtree can also be passed as the Contract root of a test Application. This limits implementation coverage to that subtree while preserving the resolved route and Context types.
