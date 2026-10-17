# Providerのscopeを登録に集約する

## 状態

採用。

## 背景

Providerのscopeは、登録tokenから解決するinstanceの寿命を表す。実装クラスやfactory、条件付き選択の定義にscopeを持たせると、同じ登録設定を生成方法ごとに指定するAPIになる。また、クラス自身をtransientで登録するために同じクラスを二度指定する必要があった。

## 決定

scopeの指定は`provide(token, { scope })`に集約する。`useClass()`・`useFactory()`・`select()`は生成方法だけを選び、scopeを変更しない。scopeの既定値は`application`とする。

具象クラスを渡した`provide(Service, options)`は、そのクラス自身を登録する宣言として利用できる。同じ呼び出しから`useClass(Implementation)`などで生成方法を選ぶこともできる。custom tokenとabstract classは単独では構築できないため、実装を指定していないbuilderをModuleのProvider宣言として受け付けない。

scopeは解決結果をキャッシュするかどうかを決め、返されるオブジェクトの参照の一意性は保証しない。`useValue()`も登録時のscopeに従い、transientでも渡された値を返す。factoryも同じオブジェクトを返せるため、参照が共有されることを理由に生成方法ごとのscope制約は設けない。

## Application Modelとの境界

クラス自身の登録宣言は、`normalizeProvider()`で既存のclass descriptorへ変換する。builderの`useClass()`メソッドとdescriptorの`useClass`実装クラスを同じプロパティとして扱わない。

canonical Application Modelには既存のProvider descriptorだけを保存する。Runtime・依存収集・graph・source locationは正規化した実装クラスとscopeを利用し、builderを解釈する責務を持たない。

## 移行

旧APIの互換引数や優先順位規則は設けない。すべての呼び出し元を次の形式へ移行する。

| 旧形式                                               | 新形式                                                  |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `provide(Service).useClass(Service, { scope })`      | `provide(Service, { scope })`                           |
| `provide(TOKEN).useClass(Implementation, { scope })` | `provide(TOKEN, { scope }).useClass(Implementation)`    |
| `provide(TOKEN).useFactory({ scope, inject, use })`  | `provide(TOKEN, { scope }).useFactory({ inject, use })` |
| `provide(TOKEN).select(key, mapping, { scope })`     | `provide(TOKEN, { scope }).select(key, mapping)`        |

具象クラスを直接並べる既存の省略形`providers: [Service]`は、引き続きapplication scopeの登録を表す。
