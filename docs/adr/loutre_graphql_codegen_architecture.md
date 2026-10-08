# GraphQLの型生成とdomain mapping

## 判断

共有するAPIの契約をSDLで記述し、Loutre CLIからserver / clientの型を生成する。実行時は標準のGraphQLSchemaへresolve / subscribeを登録し、GraphQL integrationへ渡す。rootValueによる実装と暗黙の空contextは廃止する。

SDLを共有すれば、serverの起動や実装完了を待たずに各teamが型付きで並行開発できる。独自のschema DSL、decorator、filesystem discoveryは導入しない。GraphQL Code Generatorの公式pluginを使い、生成設定は明示したJSON fileで検証する。

## 責務と境界

- SDLはAPIの公開契約。resolver型・実行用typeDefs・client型はその生成物。
- domain型は各Applicationが定義する。保存先や取得方法を型生成の前提にしない。
- mappersはGraphQL Code Generatorの既存の型対応設定。runtimeのデータ変換を行わない。
- contextとdomain mappingはserver targetだけへ適用する。client targetはSDLとoperationから通信上の型を生成する。
- DIで取得するserviceはApplication lifetime、context / loaderはoperation lifetime。Subscriptionのcontextは購読中維持される。
- protocol semanticsは引き続きgraphql-http / graphql-ws / GraphQL.jsへ委譲する。
- 型生成の依存は開発用CLIへ閉じ、Core / runtime / GraphQL transport packageへ追加しない。

## 生成契約

`loutre graphql generate --config <file>`を入口にし、targetはserverとclientの二種類に固定する。

serverはSDLからschema型・resolver型・typeDefsを生成する。contextTypeは型import、mappersはGraphQLのobject / interfaceからdomain型への対応。mapperのimportへDomain suffixを付け、GraphQL型と同名のdomain型を衝突させない。通常のfieldには標準default resolverを利用できるが、Query / Mutationのroot fieldにresolve、Subscriptionのroot fieldにsubscribeとresolveを要求する。

clientはSDLと名前付きoperation / fragmentからvariables・選択結果・TypedDocumentNodeを生成する。SDLの型だけでは選択結果を決められないため、operationを必須にする。enumはstring unionとし、未指定のcustom scalarは生成を失敗させる。scalarのinput / outputはtargetごとに指定し、server内部の値とclientの通信上の値を区別する。

入力はlocal file / globに限定する。設定からの相対pathを使用し、実行用typeDefsを出力へ含める。Applicationやdomain moduleを実行せず、importの実在性と実装の型整合性はTypeScript検査で保証する。

## 生成物とwatch

生成物はcommitする。`--check`は同じ生成・整形pipelineで比較し、欠落 / 差分でexit code 1を返す。設定 / 引数の使い方の誤りはexit code 2、生成失敗は1、成功は0とする。日時や絶対pathを生成物へ含めない。

全targetの検証を終えてから書き込み、fileごとに一時fileからrenameする。通常のsource fileを誤って上書きしないよう、既存出力には生成markerを要求する。watchはSDL / operation / 設定の追加・変更・削除を追跡し、エラー時は最後の正常な生成物を維持する。生成物自体は監視による再生成の起点にしない。

## 契約共有と互換性

monorepoのcontract workspace、またはversion付きのSDL packageを共有し、lockfileで利用versionを固定する。remote introspectionを生成の前提にしない。

`graphql validate`は分割SDLを結合して検証する。`graphql diff`はGraphQL.jsのfindBreakingChanges / findDangerousChangesで契約の変更を分類し、破壊的変更は失敗させる。認可、scalarの意味、serviceの振る舞いの変更はschema差分だけでは検出できず、integration testで確認する。

SDLの分割とextendには対応するが、独立したserviceのschemaを統合するFederation / stitchingはこの判断に含めない。

## N+1とSubscription

関連domainの取得はcontextのDataLoaderへ集約する。exampleではcache:falseを使用し、長寿命Subscriptionでの古いcacheや更新後の無効化を避ける。batch内の重複IDをまとめ、戻り値を入力IDの順序へ対応させる。frameworkによるデータ取得の自動推測は行わない。

AsyncIterableの外部待機はoperationのAbortSignalに協調して終了する。complete / disconnect / drain時のsignalとiterator.returnの伝播はtransport integrationが担当する。
