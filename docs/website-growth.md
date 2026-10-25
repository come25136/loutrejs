# 公式サイトの検索・計測運用

## 目的

検索からLoutreの用途を理解し、Docsや実行可能なサンプルへ進めるようにする。ページ閲覧と導入に向かう行動を分けて確認する。

## 管理画面

- [Search Console](https://search.google.com/search-console?resource_id=sc-domain%3Aloutrejs.come25136.id)：ページの登録状況、検索語、表示回数、クリック数。
- [GA4](https://analytics.google.com/analytics/web/#/a115798495p552115245/reports/intelligenthome)：流入元、閲覧ページ、利用行動。
- [サイトマップ](https://loutrejs.come25136.id/sitemap.xml)：公開ページの正規URL。

GA4のウェブストリームは`G-46R1D6Y88K`を使用する。拡張計測のページビューで「ブラウザの履歴イベントに基づくページの変更」を無効にし、サイトが送る`page_view`と重ねない。公開後は初回表示、内部リンク、戻る操作で一回ずつ受信することを確認する。

拡張計測はスクロールを有効にする。離脱クリック、サイト内検索、フォーム操作、動画、ダウンロードは無効にし、サイトが識別した移動先だけを独自イベントで測定する。DevToolsなどの入力や任意のリンクを自動収集へ含めないためである。

動作確認では本番URLに`?analytics_debug=1`を付けて開き、DebugViewでイベントとパラメータを確認できる。このクエリ自体は閲覧URLへ送信しない。通常の閲覧でデバッグモードを有効にしない。

## 利用行動

| イベント               | 意味                                   | 評価するときの注意             |
| ---------------------- | -------------------------------------- | ------------------------------ |
| `view_documentation`   | サイト内のDocsへ移動する操作           | 記事を読み終えたことは表さない |
| `try_example`          | StackBlitzのサンプルを開く操作         | 起動完了や実行成功は表さない   |
| `visit_repository`     | LoutreのGitHubリポジトリへ移動する操作 | Starの獲得数は表さない         |
| `visit_package`        | Loutreのnpmパッケージへ移動する操作    | インストール数は表さない       |
| `copy_install_command` | プロジェクト作成コマンドのコピー成功   | コマンドの実行数は表さない     |

`try_example`と`copy_install_command`をキーイベントにする。イベントの`page_path`、`content_language`、`destination`で入口と言語、移動先を確認する。`destination`は既知の移動先のパスだけを送信する。URLのクエリ、フラグメント、ユーザーが入力した内容をイベントのパラメータにしない。

## 公開時の確認

1. 静的HTMLでページ固有のtitle、description、canonicalと言語リンクを検証する。
2. 本番のサイトマップとrobots.txtが200を返すことを確認し、Search Consoleへサイトマップを送信する。
3. Search ConsoleのURL検査で主要ページを確認する。Googleが選んだ正規URLと登録状況は反映に時間がかかるため、送信直後の完了条件にしない。
4. GA4でページ閲覧と利用行動を実操作し、受信を確認する。テストの操作を利用者の成果として数えない。

## 改善の進め方

週ごとに、ページと言語ごとの検索表示、クリック、検索語、検索流入後の利用行動を比較する。データが少ない間は平均順位やCTRの小さな変動で判断しない。変更直前の値と確認期間をそろえ、登録状況の変化も確認する。

最初のテーマはGraphQLのN+1問題と一括取得とする。既存のOrdersサンプルで取得回数を確認でき、機能詳細と実装ガイドへの導線を作れるためである。その後、型安全なHTTP API、Cloudflare Workersでの実行を候補とし、検索語と実際の利用行動を確認して優先順位を決める。現時点では検索ボリュームを推定値として記載しない。

## 参考資料

- [Google：正規URLの指定](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google：多言語ページの指定](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google：サイトマップの作成と送信](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [GA4：ページビューの計測](https://developers.google.com/analytics/devguides/collection/ga4/views)
