# GraphQLの型生成

SDLを契約として共有し、serverと利用側の型をApplicationの起動前に生成できます。CLIはlocal SDLとoperation fileを読み取り、GraphQL Code Generatorの公式pluginを使用します。

```sh
npm install --save-dev @loutrejs/cli
```

## 設定

`graphql.codegen.json`へ生成対象を明示します。

```json
{
  "$schema": "./node_modules/@loutrejs/cli/graphql.codegen.schema.json",
  "targets": {
    "server": {
      "kind": "server",
      "schema": ["contracts/**/*.graphql"],
      "output": "src/generated/server.ts",
      "contextType": "../graphql/context.js#AppContext",
      "mappers": { "Post": "../domain/post.js#Post" }
    },
    "client": {
      "kind": "client",
      "schema": ["contracts/**/*.graphql"],
      "documents": ["operations/**/*.graphql"],
      "output": "src/generated/client.ts"
    }
  }
}
```

schema / documents / outputは設定fileからの相対pathです。contextType / mapperのimportは出力fileからの相対pathで、`module#export`形式を使います。client targetにcontextTypeやmappersは指定できません。

mappersはGraphQLの公開型とdomain型の対応です。例えばdomainのPostがauthorIdを持ち、SDLがauthor: User!を公開する場合、resolverはPostをparentとしてauthorIdから関連domainを取得できます。mappingは型生成にだけ適用し、データ変換や保存方法を決めません。同名の型importは生成時にaliasを付けます。

custom scalarはtargetごとに指定します。未知のscalarをanyへ落とさず、未指定なら生成に失敗します。

```json
{
  "scalars": {
    "DateTime": { "input": "Date", "output": "Date" }
  }
}
```

clientでは同じDateTimeを`"string"`と指定するなど、通信上の表現に合わせてください。scalarのparse / serialize処理はserverに別途実装します。

## 生成と検証

```sh
loutre graphql generate --config graphql.codegen.json
loutre graphql generate --config graphql.codegen.json --target server
loutre graphql generate --config graphql.codegen.json --watch
loutre graphql generate --config graphql.codegen.json --check
```

serverにはschema型、`Resolvers<AppContext>`等のresolver型、実行用`typeDefs`が生成されます。clientには名前付きoperationのvariables型・選択結果型・TypedDocumentNodeが生成されます。clientでTypedDocumentNodeを利用するprojectは`@graphql-typed-document-node/core`を追加してください。

生成物はcommitし、CIで`--check`とTypeScript検査を実行します。`--check`は書き込みません。watchは入力と設定を監視し、エラーが解消されたら再生成します。エラー時に最後の正常な出力を消しません。contextやdomain型のmoduleは生成時に実行せず、参照先の型はTypeScript検査で確認します。

## resolverの登録

```ts
import { makeExecutableSchema } from '@graphql-tools/schema'
import { typeDefs, type Resolvers } from './generated/server.js'
import type { AppContext } from './graphql/context.js'

const resolvers = {
  Query: {
    posts: (_parent, _args, context) => context.posts.list(),
  },
  Post: {
    author: (post, _args, context) => context.loaders.user.load(post.authorId),
  },
} satisfies Resolvers<AppContext>

const schema = makeExecutableSchema({ typeDefs, resolvers })
```

schemaを`graphql.endpoint()`へ渡し、factoryの`inject()`で取得したserviceを`context()`へ接続します。rootValueは使用できません。Query / Mutationにはresolve、Subscriptionにはsubscribeとresolveを登録します。

## SDLの共有

契約workspaceやversion付きのSDL packageを共有してください。各serviceは同じversionのSDLから、serverまたはclient targetを生成できます。利用側では呼び出すoperationを書いて生成するため、serverの実装完了を待つ必要がありません。

```sh
loutre graphql validate --schema 'contracts/**/*.graphql'
loutre graphql diff --before released/schema.graphql --after contracts/schema.graphql
loutre graphql diff --before released/schema.graphql --after contracts/schema.graphql --json
```

diffは破壊的変更でexit code 1を返し、enum値追加などのdangerous changeは別に報告します。schemaの互換性だけではserviceの振る舞いを保証できないため、実装のintegration testも必要です。分割SDLとextendに対応していますが、独立serviceのFederation / stitchingは行いません。

[実行可能なserver example](../examples/graphql-counter/README.md)と[設計判断](./adr/loutre_graphql_codegen_architecture.md)を参照してください。
