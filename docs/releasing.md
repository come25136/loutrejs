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

通常releaseはnpm Trusted Publishingを使用します。npm側で各packageのTrusted Publisherを次のGitHub Actions workflowへ設定します。

- Repository: `come25136/loutrejs`
- Workflow: `release.yml`

初回publish前はpackageがnpm上に存在せずTrusted Publisherを設定できないため、repository secret `NPM_TOKEN`を一時的に使用できます。初回publish後に5 packageすべてへTrusted Publisherを設定し、`NPM_TOKEN`は削除します。

Release workflowは`NPM_TOKEN`が存在する場合だけtoken認証を設定し、存在しない場合はOIDCによるTrusted Publishingを使用します。

## Branch

`main`をrelease可能なtrunkとして扱います。通常のPRとChangesetsのRelease PRはいずれも`main`へmergeします。
