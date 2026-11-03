# Moduleの登録は生成済みinstanceへ統一する

- 状態: IMPLEMENTED
- 日付: 2026-11-03 JST

## 判断

Applicationの`modules`とModuleの`imports`は`ModuleInstance`だけを受け付ける。引数なしのfactoryも呼び出してから登録し、Modelは登録されたinstanceの参照を共有する。

引数なしtemplateをModel構築時に暗黙で生成すると、登録方法によってfactoryの実行時点とinstanceの寿命が変わる。互換用の正規化Mapと`asModuleInstance()`を維持せず、生成は呼び出し元、依存の検証はModelに責務を分ける。`ModuleInput`のunionも公開しない。

静的Moduleは`defineModule({ ... })`、動的Moduleはfactoryの呼び出し結果を登録する。factoryは呼び出しごとにinstanceを作り、同じinstanceを複数箇所へ登録した場合は一つのModuleとして扱う。同じDefinitionから複数Applicationを起動した場合のProvider実体は、従来どおりApplicationごとに生成する。

利用例は[Moduleの定義ガイド](../ja/getting-started.md)を参照する。
