# 開発依存がない環境でのテスト起動

## 発生条件

CLIのApplication Model検証は成功する一方、Vitestの起動やexampleの型チェックが失敗する場合。

## 原因

作業ディレクトリのnode_modulesにvitestがないと、npxがキャッシュ等から実行本体を取得しても、プロジェクトのvitest.config.tsがimportするvitest/configは解決できない。tsconfigのvitest/globalsも同じ理由で見つからない。依存が欠けた経緯は推測せず、CLIの成功とテスト環境の成立を区別する。

## 安全な確認方法

`npm ls vitest --depth=0`でプロジェクトの依存を確認する。`npm config get omit`で開発依存の省略設定を確認する。npxの実行本体だけを取得できても、設定ファイルのimportが解決できるとは判断しない。

## 復旧方法

リポジトリルートで次を実行し、対象テストと型チェックを再実行する。

```sh
npm install --include=dev --ignore-scripts --no-save --package-lock=false --no-audit --no-fund
```

## 再発防止策

検証環境では開発依存もインストールする。パッケージ定義やlockfileを変更して解決しようとせず、変更差分に依存ファイルの更新が混入していないことを確認する。
