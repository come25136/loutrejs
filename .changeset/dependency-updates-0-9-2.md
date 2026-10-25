---
'@loutrejs/loutre': patch
'@loutrejs/node': patch
'@loutrejs/bullmq': patch
'@loutrejs/graphql': patch
'@loutrejs/cli': patch
'create-loutre': patch
---

依存packageの更新を取り込み、GraphQLの`graphql-ws`を`^6.4.1`へ更新しました。開発・テスト環境とサンプルの依存packageも更新し、GraphQL Ordersサンプルの未使用クライアント依存を削除しています。

公式websiteのGraphQL・Batch処理の説明とコード比較を拡充し、SDL連携・型生成・N+1対策のガイドを追加しました。Domain Mapper・Scalar・エラー整形・認可・Batch Scopeなどの詳細仕様も日本語ガイドで読めます。websiteの依存packageに対するセキュリティ更新と、表示・リンク・アクセシビリティの修正も含みます。公開6packageは同じ0.9.2でリリースします。

公開前のセキュリティ監査に対応し、開発・websiteで使うDOMPurifyを3.4.17、Electronを44.9.3、fast-uriを3.1.9、undiciを7.30.1、postcss-selector-parserを7.1.7へ更新しました。ElectronのCIも42・43・44の各系列で修正済みのversionへ揃えました。
