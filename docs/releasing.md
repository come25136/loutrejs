# Release手順

fixtureとexampleは公開対象に含めません。version更新とnpm公開の自動化は現時点では
リポジトリに含めません。

## Tarball検証

```sh
npm run release:check
```

このcommandは全packageをbuildし、`npm pack --dry-run`で`dist`、型定義、不要sourceの混入を
検査します。

公開時は全packageのversion、内部dependency range、Git tagが一致していることを別途確認します。
