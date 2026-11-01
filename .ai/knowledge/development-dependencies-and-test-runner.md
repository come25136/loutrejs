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

## TypeScriptのAST APIを使う補助script

このworktreeのTypeScript 7パッケージはversion情報のみをexportし、createSourceFileやScriptTargetを提供しない。tscが動いても、従来のJavaScript compiler APIを使えるとは判断しない。

変換scriptを作る前にexportを確認する。ASTが必要なら既存依存の@swc/coreを使う。SWCのspanは1始まりのUTF-8 byte offsetなので、日本語を含むsourceをJavaScript文字列のindexで切らず、Bufferで編集する。変換後にformat・型チェック・関連テストを行い、依存バージョンを変更して対処しない。

## LSPの起動失敗を切り分ける

統合テストの並列実行中にeditor-navigationがTypeScript LSPの終了code 2で一度失敗した。stderrを一時採取して単独実行したところ成功し、元のテストへ戻した後の統合全体の再実行も成功した。原因は確定していない。

再発時は対象テストを単独実行し、LSPのstderrを確認してから全体を再実行する。stderrを破棄したまま認証・型推論の変更が原因と断定したり、テストをskipして対処したりしない。診断のための一時的なテスト変更は復元する。
