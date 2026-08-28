# Loutre Application

Loutreで作成したNode.js HTTP Applicationです。

## 開発

```sh
npm run dev
```

<http://127.0.0.1:3000> へアクセスするとJSONレスポンスを返します。

## 品質チェック

生成時点でLoutre公式のTypeScript、Vitest、Oxlint、Oxfmt設定が含まれています。

```sh
npm test
npm run lint
npm run format:check
npm run check
npm run verify
```

`npm run verify`はformat、lint、type / Application Graph、test、buildをまとめて検証します。
