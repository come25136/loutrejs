# @loutrejs/cli

## 0.5.0

### Patch Changes

- 6375229: HTTP Contractをネストして構成できるようにしました。親routeのpath・pipeline・responsesを子Contractへ継承し、`AppContract.http.api.me.profile`のように解決済みContract nodeを型安全に参照してImplementationへ割り当てられます。あわせて不正なContract compositionを型レベルで検出するようにしました。

  ApplicationのContract rootはImplementationから推論するようにし、`defineApplication`への`contract`指定を不要にしました。create-loutreのテンプレートも新しいApplication定義へ更新しています。

  CLIでbundleされたLoutreとアプリケーション側LoutreのContract identityを共有し、bundle境界をまたぐContract判定が正しく動作するようにしました。

- Updated dependencies [6375229]
  - @loutrejs/loutre@0.5.0

## 0.4.1

### Patch Changes

- @loutrejs/loutre@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [c8968bb]
  - @loutrejs/loutre@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8573a15]
  - @loutrejs/loutre@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [bbbb693]
  - @loutrejs/loutre@0.2.0
