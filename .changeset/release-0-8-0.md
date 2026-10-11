---
'@loutrejs/loutre': minor
'@loutrejs/node': minor
'@loutrejs/bullmq': minor
'@loutrejs/graphql': minor
'@loutrejs/cli': minor
'create-loutre': minor
---

GraphQLのHTTP / WebSocket transportとSubscriptionに対応する`@loutrejs/graphql`を追加しました。SDLを契約として共有し、CLIでResolver型・Static Schema・型付きBindingを生成できます。Domain Mapper、Scalarのinput / output型、Enumの内部値に対応し、手書きResolverとApplication Contextを型付きで接続できます。

Resolverは`resolve({ parent, args, context, info })`、Subscriptionは同じobject引数の`subscribe` / `resolve`を使います。関連Fieldの`load({ parents, args, context, signal, selection })`でBatch取得を行い、先読み値の再利用、認可、個別Error、Operation / Mutation root / Subscription event単位のScopeと中断を扱えます。任意の`formatError`でHTTP / WebSocket共通のエラー公開方針を設定できます。Helperと型は`@loutrejs/graphql`からimportします。

CLIのOpenAPI生成がcontract-first entryに対応しました。Applicationを実行せずにHTTP Contractを共有でき、routeの重複検証とmethodの正規化を共通化しました。HTTP Contractの同一性を検証し、定義後のroute変更がtoolingへ影響しないようにしました。

Node / Bun / Deno / Cloudflare WorkersのWebSocket実行を整備しました。依存packageを更新し、公開tarballのconsumer、GraphQL.js 16 / 17、server examplesのQuery / Mutation / SubscriptionとBatch取得を検証しています。

GraphQLのserver生成物は`types.ts`・`schema-ast.ts`・`bindings.ts`です。`bindManifest<AppContext>({ schemaDocument, resolvers })`で手書きResolverを接続し、`graphql.endpoint({ manifest, factory })`で公開します。Clientの型とTypedDocumentNodeは明示的なclient targetで生成します。
