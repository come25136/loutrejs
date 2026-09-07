# Nested Contract Auth Example

この例では、feature単位のHTTP ContractをApplicationのContract treeへネストし、親branchの認証を子routeへ継承します。

`ProfileContract`はprofile endpointだけを定義します。`AppContract`はそのContractを`/api/me`配下へmountし、親branchで認証middlewareと`unauthorized` responseを宣言します。

```ts
export const AppContract = http.contract({
  api: {
    path: '/api',
    routes: {
      me: {
        path: '/me',
        responses: {
          unauthorized: {
            status: 401,
            body: z.object({ error: z.string() }),
            headers: z.object({ 'www-authenticate': z.string() }),
          },
        },
        middlewares: [authentication],
        routes: ProfileContract.routes,
      },
    },
  },
})
```

Controllerは解決済みの`AppContract`へbindします。親branchの認証middlewareが提供する`ctx.state.currentUser`は子routeのContextへ型付きで継承されます。この関係をTypeScriptで検証できるよう、Controllerでは明示的な代入を残しています。

```ts
const currentUser: User = ctx.state.currentUser
```

このexample directoryからApplicationを起動します。

```sh
npm run dev
```

認証情報のないrequestは親branchの認証middlewareに拒否されます。

```sh
curl -i http://127.0.0.1:3003/api/me/profile
```

example用の認証情報を渡すと子Controllerへ到達します。

```sh
curl -i -u loutre:otter http://127.0.0.1:3003/api/me/profile
```

```json
{ "id": "user-1", "name": "Loutre User" }
```

この認証情報はexample専用です。

Application Model、型、動作を検証します。

```sh
npm run check
npm run typecheck
npm test
```
