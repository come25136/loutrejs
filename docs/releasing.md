# Release

LoutreはChangesetsでreleaseを管理します。

## 通常のrelease

1. 公開対象のPRで`npm run changeset`を実行し、Changesetをcommitします。
2. PRを`main`へmergeします。
3. Release workflowがChangesetをまとめた`Version Packages` PRを作成または更新します。
4. releaseするタイミングで`Version Packages` PRをmergeします。
5. Release workflowが公開packageをnpmへpublishし、同じversionの`vX.Y.Z` tagとGitHub Releaseを作成します。

`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`、`@loutrejs/cli`、`create-loutre`はfixed groupのため、常に同じversionでreleaseされます。

## npm認証

releaseはnpm Trusted Publishingのみを使用します。npm側で各packageのTrusted Publisherを次のGitHub Actions workflowへ設定します。

- Repository: `come25136/loutrejs`
- Workflow: `release.yml`
- Allowed action: `npm publish`

Release workflowは`id-token: write`でOIDC認証し、長期npm tokenは使用しません。

## Branch

`main`をrelease可能なtrunkとして扱います。通常のPRとChangesetsのRelease PRはいずれも`main`へmergeします。
