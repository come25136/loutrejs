# Nested HTTP Contract compositionへの移行

HTTP Contract compositionは、Application全体で解決されたContract treeを持つmodelへ移行しました。feature Contractは引き続き独立して定義できますが、server ImplementationはApplication Contractから選択したresolved nodeへbindする形をcanonicalとします。

## 変更前

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

## 変更後

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

effective routeは`GET /api/users/{id}`です。branchの`pipeline`はdescendant pipelineを包み、branchの`responses`は各descendantへmergeされます。継承後に同名response variantが衝突する場合、暗黙overrideせずエラーになります。

resolved nodeはpublic API上ではopaque objectです。内部Contract定義やnode identity等のframework metadataはSymbolへ隠し、Application codeからは`AppContract.http.api.get`のような通常のproperty accessだけを利用します。

resolved subtreeをtest ApplicationのContract rootとして渡すこともできます。この場合、解決済みroute / Context型は維持したまま、implementation coverageをそのsubtreeへ限定できます。
