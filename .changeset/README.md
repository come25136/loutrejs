# Changesets

公開対象の変更を含むPRでは、release noteとSemVer bumpをChangesetとして追加します。

```sh
npm run changeset
```

Loutreの公開packageはfixed groupとして扱うため、1 packageへのChangesetでも全packageが同じversionでreleaseされます。
`patch` / `minor` / `major`は変更内容に合わせて選択し、生成された`.changeset/*.md`をPRへ含めます。

version更新とnpm publishはGitHub Actionsが管理します。通常の開発で`npm run release:version`や`npm run release:publish`を直接実行しません。
