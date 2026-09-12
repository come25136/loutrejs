# Release

LoutreはChangesetsでreleaseを管理します。

## 通常のrelease

1. 公開対象のPRで`npm run changeset`を実行し、Changesetをcommitします。
2. PRを`main`へmergeします。
3. Release workflowがChangesetをまとめた`Version Packages` PRを作成または更新します。
4. releaseするタイミングで`Version Packages` PRをmergeします。
5. Release workflowが変更対象のpackageをnpmへpublishします。`@loutrejs/loutre`のversionが更新されたreleaseでは、そのCore versionに対応する`vX.Y.Z` tagとGitHub Releaseも作成します。

## Version policy

`@loutrejs/loutre`、`@loutrejs/node`、`@loutrejs/bullmq`はliveなCore型・runtime identityを共有するためfixed groupに含め、release operation上は同じversionへ揃えます。

`@loutrejs/cli`と`create-loutre`は独立したtooling lifecycleを持つためfixed groupへ含めません。Coreの変更に追従する必要がある場合はChangesetsがdependency rangeを更新して必要なreleaseを行い、toolingだけの変更ではCore packageを不要にpublishしません。

GitHubの`vX.Y.Z` tagは`@loutrejs/loutre`のversionを表します。CLIまたはinitializerだけのreleaseでは新しいCore tag / GitHub Releaseを作成せず、npm package releaseだけを行います。

## npm認証

releaseはnpm Trusted Publishingのみを使用します。npm側で各packageのTrusted Publisherを次のGitHub Actions workflowへ設定します。

- Repository: `come25136/loutrejs`
- Workflow: `release.yml`
- Allowed action: `npm publish`

Release workflowは`id-token: write`でOIDC認証し、長期npm tokenは使用しません。

## Branch

`main`をrelease可能なtrunkとして扱います。通常のPRとChangesetsのRelease PRはいずれも`main`へmergeします。
