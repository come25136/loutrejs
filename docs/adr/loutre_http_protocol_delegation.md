# HTTP Contractからのprotocol処理の委任

ステータス: Accepted

## 背景

GraphQL endpointが独立してpathを持つと、通常HTTPとGraphQLの公開URL、middleware、階層が別の宣言へ分散する。ルートを一覧して変更・監査したい利用者は、HTTP Contractだけでは公開範囲を把握できない。

従来の「GraphQL over HTTPの仕様をHTTP Contractへ二重定義しない」という判断は、GraphQLのQuery・Mutation・Subscriptionやresponse variantをHTTP側へ複製しないためのものである。pathやmethodの所有者までGraphQLへ分ける根拠にはしない。

## 責務

HTTP Contractを公開ルートの正本とし、path、method、middleware、branchの継承を所有する。GraphQLのSDLとmanifestはoperationの入出力を所有し、GraphQL adapterがHTTP bodyのdecode、GraphQL validation、実行、WebSocket subprotocolを扱う。

通常HTTPはhttp.implementation、GraphQLはgraphql.implementationが担当する。GraphQL実装はHTTP Contractのrawルートをrouteとして参照する。GraphQL adapterへpathやHTTP middlewareを再指定しない。通常HTTPとGraphQLのルート衝突は同じHTTP routingの検証で検出する。

WS upgradeも同じContractから解決したpathへ接続する。WS lifecycleはGraphQL handlerの設定へ置き、DIしたサービスと接続stateを利用できるようにする。protocolのためだけに別Containerや実行時だけの依存を追加しない。

## 利用者の操作

公開URLやHTTP middlewareを変える場合はHTTP Contractを編集する。GraphQLのfieldやresolverを変える場合はSDL・manifest・resolverを編集する。認証サービスやWS lifecycleを変える場合は実装を編集する。

Contractへprotocol routeを置いても、GraphQLの入出力をHTTP response variantとして列挙させない。OpenAPIには通常HTTPのoperationを出し、protocol endpointのmetadataはApplication Modelへ残す。契約を直接渡すOpenAPI生成でも同じ境界を使う。

## 公開APIと検証

HTTP implementationからhandlerへ委任するAPIをexampleで示し、型付きHTTP state、WSの有効化に必要なhost capability、canonical Model、DI、branch継承、route conflict、CLIの解析結果を揃える。factoryの実行結果によってModelに現れないWS endpointが増える構造にはしない。

```ts
const Api = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
  profile: {
    raw: true,
    method: '*',
    path: '/graphql',
    middlewares: [httpAuthentication],
  },
})
const Health = http.implementation({
  contract: Api,
  factory: () => ({ health: (ctx) => ctx.response.ok({}) }),
})
const Profile = graphql.implementation({
  name: 'Profile',
  route: Api.routes.profile,
  manifest,
  ws: true,
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate(payload)
        return user
          ? { currentUser: { id: user.id } }
          : new ConnectionRejected('認証が必要です。')
      },
    },
    context: ({ state, signal }) => {
      if (!state.currentUser) throw new Error('認証済みの利用者がありません。')
      return { currentUser: state.currentUser, users, signal }
    },
  }),
})
```

raw: trueはHTTP request/responseの処理を委任する明示的な印である。responsesの書き忘れをrawとして受け付けない。rawルートはHTTP response variantとrequest body schemaを持たず、HTTP implementationのhandler一覧、型付きHTTP client、OpenAPIのoperationから除外する。単独のraw処理は既存のhttp.rawへ同じルートを渡して実装できる。raw: trueの参照はhttp.contractで正規化したものに限定し、未正規化のpathやmiddlewareをGraphQLへ直接渡す経路を設けない。

branchのpathとmiddlewareはrawルートにも継承する。branchで宣言したresponse variantは通常HTTP用であり、rawルートへ継承する組合せは型と実行時の両方で拒否する。GraphQLのHTTP入出力はmanifestとprotocolが所有するためである。

HTTP Contractのmiddlewareは通常HTTPとWS Upgradeの両方で、同じ順序で実行する。認証をConnectionInitまで延期するかはmiddleware自身がUpgradeヘッダーを見て決める。適用条件用のwrapperや、認証方式をframeworkが分類する仕組みは追加しない。

Upgrade前のmiddlewareはHTTPの要求処理として扱い、nextの完了はhandshakeまでとする。接続中の処理はGraphQLのWS lifecycleが担当する。middleware間のstateは通常と同様に伝播し、接続のstateとしても読み取れる。ConnectionInitはそのstateを読み、自身が返す接続stateを作る。ConnectionInitを指定しない場合はmiddlewareのstateをそのまま使う。

認証を省略する分岐があるmiddlewareは、その寄与を部分的なstateとして宣言する。認証後のGraphQL contextは必須の利用者があることを確認して組み立てる。既存のnextのstate必須規約を弱めたり、Upgradeに架空の利用者を渡したりしない。

通常HTTPのfetch入口はUpgradeを示すヘッダー付き要求を400で拒否し、通常のhandlerへ到達させない。WS入口はGET、path、subprotocolとnative handshakeを検証する。Node adapterは元のmethodでGET以外を拒否し、handshake前の拒否応答のstatus・headers・bodyを送る。Fetch Requestが禁止するTRACE等もRequest作成前に拒否する。WSを有効にするルートはGETまたは*を受け付ける必要がある。

WSのmiddlewareの依存とcapabilityはWebSocket executionのModelへ登録し、実行時にはそのexecutionの既存resolverで解決する。別Containerや遅延DI取得APIを追加しない。middlewareが短絡した場合はdriverとsessionを開始せず、開始後のmiddleware失敗では接続を終了してleaseを解放する。

httpとwsの有効化は引き続き独立した静的設定とし、HTTPは既定で有効、WSは既定で無効にする。GraphQL実装側のhttp設定はbooleanだけとし、path・method・middlewareの上書きを廃止する。既存graphql.endpointは残さない。
