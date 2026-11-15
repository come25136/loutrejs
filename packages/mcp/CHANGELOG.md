# @loutrejs/mcp

## 0.11.1

### Patch Changes

- 5582f1a: 依存パッケージ24件を更新します（#190）。

  GraphQL.js 17.1.0、GraphQL Code Generator 7/8、workerd、Electron、SWC、Vitest、CLI・開発ツール、およびウェブサイト関連依存を更新し、最新のバグ修正と互換性改善を取り込みます。公開パッケージの API に意図した変更はありません。

- Updated dependencies [5582f1a]
  - @loutrejs/loutre@0.11.1

## 0.11.0

### Minor Changes

- 7dbd2d6: `@loutrejs/mcp` を追加し、既存の Module と DI から MCP Tool を Streamable HTTP で公開できるようにします。endpoint ごとの OAuth、Tool ごとの scope 認可、呼び出しごとの Context を提供し、同じ HTTP listener 上の複数 endpoint を分離します。

  GraphQL と MCP の endpoint は共通の Execution 委譲を使用します。Core が factory と middleware の依存を Application Model へ集約し、HTTP・WebSocket・Tasks・MessagePort を含む各 Runtime の責務と終了処理を整理します。HTTP の中断 signal を統一し、GraphQL の並行 resolver・Batch・Subscription と MCP Tool の実処理が完了するまで Provider を保持します。

  以下の公開 API に破壊的変更があります。

  - WebSocket の入力検証結果は `kind` で判別します。frame の表現形式は従来どおり `type: 'text' | 'binary'` です。
  - Tasks の宣言 payload は `declaration` 配下へ移動します。
  - MessagePort の実行結果は `kind: 'unary' | 'stream'` を明示します。
  - 独自 Extension は `context.compileHandler()` と `context.collectDependencies()` で依存を登録します。Application Model の依存一覧は常に配列になります。

  HTTP・WebSocket・MessagePort・MCP は契約で宣言した method だけを検証し、prototype 上や非列挙の method も元の receiver を維持して呼び出します。

### Patch Changes

- Updated dependencies [7dbd2d6]
  - @loutrejs/loutre@0.11.0
