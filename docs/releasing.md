# Release

LoutreはChangesetsでreleaseを管理します。ただしChangesetは各feature PRへ分散させず、release時に前回releaseからの差分をまとめて作成します。

## 通常のrelease

1. release対象の`main`差分を前回tagから確認し、release versionとrelease noteを決めます。
2. `chore(release): prepare X.Y.Z` PRを作り、そのPRだけで`.changeset/**`を更新します。
3. release Changesetには公開対象5packageをすべて明示し、同じSemVer bumpへ揃えます。
4. release準備PRを`main`へmergeします。
5. Release workflowがChangesetを消費して`chore(release): version packages` PRを作成または更新します。
6. version PRでpackage version、internal dependency、lockfile、CHANGELOG、generated versionを確認します。
7. version PRをmergeするとRelease workflowが公開packageをnpmへpublishし、同じversionの`vX.Y.Z` tagとGitHub Releaseを作成します。

feature / fix / refactor / docsなど通常のPRでは`.changeset/**`を変更しません。CIも`chore(release): ...`以外のPRによる`.changeset/**`変更を拒否します。

`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`、`@loutrejs/cli`、`create-loutre`はfixed groupのため、常に同じversionでreleaseします。

## npm認証

releaseはnpm Trusted Publishingのみを使用します。npm側で各packageのTrusted Publisherを次のGitHub Actions workflowへ設定します。

- Repository: `come25136/loutrejs`
- Workflow: `release.yml`
- Allowed action: `npm publish`

Release workflowは`id-token: write`でOIDC認証し、長期npm tokenは使用しません。

## Branch

`main`をrelease可能なtrunkとして扱います。通常のPR、release準備PR、Changesetsのversion PRはいずれも`main`へmergeします。
