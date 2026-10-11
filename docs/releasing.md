# Release

LoutreはChangesetsでreleaseを管理します。ただしChangesetは各feature PRへ分散させず、release時に前回releaseからの差分をまとめて作成します。

## 通常のrelease

1. release対象の`main`差分を前回tagから確認し、release versionとrelease noteを決めます。
2. `chore(release): prepare X.Y.Z` PRを作り、そのPRでrelease note用Changesetを作成します。
3. release Changesetには公開対象6packageをすべて明示し、同じSemVer bumpへ揃えます。
4. release準備PRを`main`へmergeします。
5. Release workflowがChangesetを消費して`chore(release): version packages` PRを作成または更新します。
6. version PRでpackage version、internal dependency、lockfile、CHANGELOG、generated versionを確認します。
7. version PRをmergeするとRelease workflowが公開packageをnpmへpublishし、同じversionの`vX.Y.Z` tagとGitHub Releaseを作成します。

feature / fix / refactor / docsなど通常のPRではrelease note用Changesetを変更しません。CIも`chore(release): ...`以外のPRによるrelease note用Changeset変更を拒否します。

`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`、`@loutrejs/graphql`、`@loutrejs/cli`、`create-loutre`はfixed groupのため、常に同じversionでreleaseします。

## npm認証

通常のreleaseはnpm Trusted Publishingを使用します。npm側で各packageのTrusted Publisherを次のGitHub Actions workflowへ設定します。

- Repository: `come25136/loutrejs`
- Workflow: `release.yml`
- Allowed action: `npm publish`

Release workflowは`id-token: write`でOIDC認証し、長期npm tokenは使用しません。

## 新packageの初回公開

Trusted Publisherはnpm registry上に存在するpackageに設定します。新packageはversion PRの検証完了後、merge前にnpm所有者がそのPRのcommitから初回公開します。初回公開後にTrusted Publisherを設定し、version PRをmergeします。Release workflowは公開済みのpackage versionを省略し、残りのpackageを公開します。

```sh
npm login
npm ci --no-audit --no-fund
npm run release:check
npm publish ./packages/graphql --access public --provenance=false
npx --yes npm@^11.15.0 trust github @loutrejs/graphql --repo come25136/loutrejs --file release.yml --allow-publish
```

上記は`@loutrejs/graphql`の初回公開例です。公開元がversion PRのcommitであり、packageとpeer dependencyのversionがrelease対象と一致することを確認してください。ローカルでの初回公開はGitHub ActionsのOIDC証明を持たないため、その1回のみprovenanceを無効にします。以降はworkflowのTrusted Publishingとprovenanceを使います。初回公開直後は残りの同一versionのpackageが未公開のため、version PRのmergeとRelease workflow完了まで利用者へ公開完了を案内しません。

設定にはpackageへのwrite権限、npmへのログイン、2FAが必要です。`npm trust`にはnpm 11.15.0以上が必要なため、上記では対応するnpm CLIを明示して実行します。手順とCLIの要件は[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)と[npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)を参照してください。

## Branch

`main`をrelease可能なtrunkとして扱います。通常のPR、release準備PR、Changesetsのversion PRはいずれも`main`へmergeします。

package構成の変更に伴う`config.json`と本ガイドの更新は通常PRで行います。release note用Changesetはrelease PRに集約します。
