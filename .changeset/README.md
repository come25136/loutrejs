# Changesets

`.changeset/**`はrelease作業専用です。feature / fix / refactor / docsなど通常のPRでは追加・変更・削除しません。

release時は前回releaseからの差分をまとめて確認し、`chore(release): ...` PRでrelease noteとSemVer bumpを1つのChangesetとして作成します。

```sh
npm run changeset
```

Loutreの公開packageはfixed groupとして同じversionでreleaseします。release Changesetでは公開対象5packageをすべて明示し、`patch` / `minor` / `major`の分類も同じrelease単位に揃えます。

Changesetを含むrelease準備PRを`main`へmergeすると、GitHub Actionsがversion更新用の`chore(release): version packages` PRを作成または更新します。version更新とnpm publishはGitHub Actionsが管理するため、通常の開発では`npm run release:version`や`npm run release:publish`を直接実行しません。
