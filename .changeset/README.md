# Changesets

公開対象の変更を含むPRでは、release noteとSemVer bumpをChangesetとして追加します。

```sh
npm run changeset
```

liveなCore型・runtime identityを共有する`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`はfixed groupとして扱い、release operation上は同じversion lineへ揃えます。
`@loutrejs/cli`と`create-loutre`は独立したtooling lifecycleを持つためfixed groupへ含めず、それぞれ変更が必要なときだけreleaseします。

`patch` / `minor` / `major`は変更内容に合わせて選択し、生成された`.changeset/*.md`をPRへ含めます。fixed groupで自動的にversionが上がるpackageにも利用者向けの実変更がある場合は、そのpackage自身のChangesetも追加してrelease noteを残します。

version更新とnpm publishはGitHub Actionsが管理します。通常の開発で`npm run release:version`や`npm run release:publish`を直接実行しません。
