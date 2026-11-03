# Moduleの登録と引数なしfactoryの生成

- 状態: IMPLEMENTED
- 日付: 2026-11-04 JST

## 判断

Applicationの`modules`とModuleの`imports`は、生成済みの`ModuleInstance`と引数なしの`ModuleTemplate<void>`を受け付ける。共通の入力型は`ModuleInput`で表す。

引数なしtemplateの自動生成はModule APIの機能として扱う。Model構築中は同じtemplateから一つのinstanceだけを生成し、rootとimportで共有する。Application間に生成結果を保持するcacheは設けない。Model構築ごとに生成し直し、Providerの実体もApplicationごとに管理する。

静的Moduleは`defineModule({ ... })`の呼び出し時にinstanceを作る。引数が必要なfactoryは設定を渡して呼び出してから登録する。明示呼び出しは毎回別のinstanceを返すため、同じ設定でも自動的には共有しない。単独の入力をinstanceへ変換する`asModuleInstance()`は、Model内の共有を管理する役割とは分ける。

利用例は[Moduleの定義ガイド](../ja/getting-started.md)を参照する。
