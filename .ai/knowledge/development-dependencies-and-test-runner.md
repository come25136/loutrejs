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

このworktreeのTypeScript 7パッケージはversion情報のみをexportし、createSourceFileやScriptTargetを提供しない。tscが動いても、従来のJavaScript compiler APIを使えるとは判断しない。dependency-cruiserもTypeScript 7未対応の警告を出すため、コマンドの成功だけで全TypeScript依存を解析できたと判断しない。型チェックと実装の依存方向のレビューを併用する。

変換scriptを作る前にexportを確認する。ASTが必要なら既存依存の@swc/coreを使う。SWCのspanは1始まりのUTF-8 byte offsetなので、日本語を含むsourceをJavaScript文字列のindexで切らず、Bufferで編集する。変換後にformat・型チェック・関連テストを行い、依存バージョンを変更して対処しない。

## LSPの起動失敗を切り分ける

統合テストの並列実行中にeditor-navigationがTypeScript LSPの終了code 2で一度失敗した。stderrを一時採取して単独実行したところ成功し、元のテストへ戻した後の統合全体の再実行も成功した。原因は確定していない。

再発時は対象テストを単独実行し、LSPのstderrを確認してから全体を再実行する。stderrを破棄したまま認証・型推論の変更が原因と断定したり、テストをskipして対処したりしない。診断のための一時的なテスト変更は復元する。

## watchテストの一時的な再構築

dev-serverのwatchテストが「無関係なファイルの変更で再構築数が増えた」として断続的に失敗した。単独24件と統合全体268件が成功する実行もあったが、buildを並行させず、worker数を1にした統合実行でも再発した。原因は確定していない。この作業ではwatchの実装とテストを変更していない。

今回のUpgrade対応でも同じ期待値の失敗が全体実行と対象2ファイルの実行で再発した。編集とbuildを終えた後の統合全体再実行は270件成功した。テストの期待値や待機時間は変更していない。 transportsの設定整理時にもローカルの統合実行で同じ1件が再発し、残る269件は成功した。

watch対象・ファイルイベント・再構築回数を確認し、buildや編集を止めて対象テストと統合全体を順に再実行する。並列実行だけが原因とは判断せず、解消しない場合は成功件数と残る失敗を分けて報告する。待機時間や期待値を緩めて対処しない。

## 変換scriptの検索範囲

同じ変数名を複数の関数が使うファイルで、文字列の先頭一致から置換範囲を取ると、別の関数の処理まで削除することがある。formatで構文エラーを検出した場合は、既存のユーザー差分を確認してから自分の変更だけを復旧する。

検索開始位置を対象関数内へ限定し、置換前に一致数と範囲を確認する。構造を変える編集にはパッチを優先し、format・差分確認・型チェックの順で誤編集を検出する。ファイル統合時に文字列をtrimして連結すると、型名とextendsの空白が失われることもある。formatの構文検証に失敗したら連結を修正してから後続の検証へ進む。test:typesは全exampleを読み込むわけではないため、成功しても通常のcheckと対象exampleのModel検証を省略しない。

## formatterの選択

このリポジトリはoxfmtを使用する。設定を確認せずnpx prettierを実行すると、未導入のformatterを取得し、引用符・semicolonなどの差分が変更対象全体へ広がる。

実行前にpackage.jsonのformat scriptを確認し、既存のユーザー編集を除いて対象ファイルだけをoxfmtへ渡す。誤って整形した場合は同じ範囲をoxfmtで再整形し、git diffで無関係な変更と依存ファイルの混入がないことを確認する。ユーザー編集を含むファイルを一括復元しない。

## 日本語のparameterized test名

Vitestのit.eachで`$headersの場合は$expectedを返す`のようにproperty名へ日本語を直結すると、表示名がundefinedになった。置換するproperty名の境界を意図どおりに認識できないためで、テストの入力自体は渡っていた。

失敗時は表示名と入力のオブジェクトを別々に確認する。`%j`による入力表示、またはproperty名の前後に空白を置く形式へ変更し、実行結果で各ケースを識別できることを確認する。日本語を含むテスト名ではplaceholderの境界を明示する。

## 公開API変更後のpackage consumer CI

### 発生条件・原因

型チェック・単体・統合・runtime適合検証が成功する一方、tarballを入れるNode.js consumer jobだけがimport検証で失敗する場合。graphql.endpointを廃止してgraphql.implementationへ置き換えた際、ci.yml内のJavaScript式に旧API参照が残った。workflow内の式とWebサイト内のコード文字列はTypeScriptの型チェック対象にならない。

### 安全な確認方法

PRのhead SHAに対応する失敗jobとstepを調べ、インストールやimport自体の失敗と、import後のAPI検証の失敗を分ける。配布tarballだけを別の一時ディレクトリへインストールし、workflowと同じ式を実行する。リポジトリのnode_modulesへのsymlinkやsource aliasで配布検証を代用しない。

### 復旧方法・再発防止策

CIの検証対象を現行APIへ更新し、廃止APIの互換aliasを復活させて回避しない。GraphQLの公開APIはtarballだけを使うconsumer CIで確認する。公開APIを削除するときはCI・conformance・Webサイトのコード例も検索し、意図的な型エラーのテストと過去のCHANGELOGを除いて旧参照が残っていないことを調べる。

## workflowの検証式をvmで実行しない

### 発生条件・原因

ci.ymlから読み出したJavaScriptを単体テストのrunInNewContextへ渡すと、CodeQLのjs/code-injectionに検出された。テスト用であっても、ファイル内容が動的コード実行の入力になる。公開APIの確認には不要な実行経路だった。

### 安全な確認方法

code scanning alertの対象commit・path・データフローを確認し、通常のCI jobの成功だけでcode scanningも成功したと判断しない。check-runsからCodeQLのconclusionも確認する。

### 復旧方法・再発防止策

vm実行のテストとimportを削除し、tarballを隔離環境へインストールするconsumer CIを公開APIの検証に使う。文字列をevalやFunctionへ渡す別方式へ置き換えたり、警告を抑制したりしない。push後は最新headのCodeQL成功とalertの修正状態を確認する。

## 一時ディレクトリのworktreeが欠落した場合

### 発生条件・原因

`/tmp`配下のworktreeで作業を再開した際、`.git`ファイルと追跡対象の一部が失われ、元リポジトリのworktree一覧ではprunableと表示された。削除原因は確認できていない。未コミットのユーザー編集と依存ファイルは残っていた。

### 安全な確認方法

残存ファイルを確認し、元リポジトリで`git worktree list --porcelain`と対象PRのheadを照合する。`.git`がないディレクトリでGit操作が失敗しても、残った編集を不要と判断しない。

### 復旧方法・再発防止策

残存ファイルは保存したまま、確認済みのPR headから永続ディレクトリへ新しいworktreeを作る。依存を再インストールし、新しい作業だけを反映する。旧ディレクトリのユーザー編集は無断で取り込まず、削除・reset・worktree pruneもしない。複数日にわたる作業のworktreeは`/tmp`へ置かない。
