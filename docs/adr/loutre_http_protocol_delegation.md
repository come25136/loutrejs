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

配布パッケージのconsumer検証もgraphql.implementationを公開APIとして確認する。CIのJavaScript式やWebサイトのコード文字列は型チェックだけでは旧APIの残存を検出できないため、tarballだけをインストールしたconsumerで公開APIを検証する。workflowから抜き出した文字列をvm・eval・Function等で実行する単体テストは追加しない。

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
  transports: { http: true, websocket: true },
  factory: (users = inject(Users)) => ({
    ws: {
      connectionInit: ({ payload }) => {
        const user = users.authenticate(payload)
        return user
          ? { currentUser: { id: user.id } }
          : new ConnectionRejected('Authentication required.')
      },
    },

    context: ({ state, signal }) => {
      if (!state.currentUser) throw new Error('Authenticated user is missing.')

      return { currentUser: state.currentUser, users, signal }
    },
  }),
})
```

raw: trueはHTTP request/responseの処理を委任する明示的な印である。responsesの書き忘れをrawとして受け付けない。rawルートはHTTP response variantとrequest body schemaを持たず、HTTP implementationのhandler一覧、型付きHTTP client、OpenAPIのoperationから除外する。単独のraw処理は既存のhttp.rawへ同じルートを渡して実装できる。raw: trueの参照はhttp.contractで正規化したものに限定し、未正規化のpathやmiddlewareをGraphQLへ直接渡す経路を設けない。

branchのpathとmiddlewareはrawルートにも継承する。branchで宣言したresponse variantは通常HTTP用であり、rawルートへ継承する組合せは型と実行時の両方で拒否する。GraphQLのHTTP入出力はmanifestとprotocolが所有するためである。

HTTP Contractのmiddlewareは通常HTTPとWS Upgradeの両方で、同じ順序で実行する。認証をConnectionInitまで延期するかはmiddleware自身がhttp.isWebSocketUpgrade(request)で決める。適用条件用のwrapperや、認証方式をframeworkが分類する仕組みは追加しない。

http.isWebSocketUpgrade(request)はUpgradeヘッダーがwebsocketであるかを大文字・小文字を区別せず判定する。middlewareとruntime adapterでこの判定を共有し、利用者へヘッダー操作を要求しない。method・Connection・key・versionを含むhandshake全体の検証は既存のWS入口とnative driverが担当する。認証を省略するという判断自体はアプリ側に残す。

Upgrade前のmiddlewareはHTTPの要求処理として扱い、nextの完了はhandshakeまでとする。接続中の処理はGraphQLのWS lifecycleが担当する。middleware間のstateは通常と同様に伝播し、接続のstateとしても読み取れる。ConnectionInitはそのstateを読み、自身が返す接続stateを作る。ConnectionInitを指定しない場合はmiddlewareのstateをそのまま使う。

認証を省略する分岐があるmiddlewareは、その寄与を部分的なstateとして宣言する。認証後のGraphQL contextは必須の利用者があることを確認して組み立てる。必須propertyのあるstateは引き続きnext(state)を要求する。stateが未指定または全propertyがoptionalの場合はnext()を許可し、stateを追加せず後続へ進む。Upgradeに架空の利用者を渡さない。

通常HTTPのfetch入口はUpgradeを示すヘッダー付き要求を400で拒否し、通常のhandlerへ到達させない。WS入口はGET、path、subprotocolとnative handshakeを検証する。Node adapterは元のmethodでGET以外を拒否し、handshake前の拒否応答のstatus・headers・bodyを送る。Fetch Requestが禁止するTRACE等もRequest作成前に拒否する。WSを有効にするルートはGETまたは*を受け付ける必要がある。

WSのmiddlewareの依存とcapabilityはWebSocket executionのModelへ登録し、実行時にはそのexecutionの既存resolverで解決する。別Containerや遅延DI取得APIを追加しない。middlewareが短絡した場合はdriverとsessionを開始せず、開始後のmiddleware失敗では接続を終了してleaseを解放する。

transports.httpとtransports.websocketの有効化は独立した静的設定とし、HTTPは既定で有効、WSは既定で無効にする。GraphQL実装側のtransports.httpはbooleanだけとし、path・method・middlewareの上書きを廃止する。既存graphql.endpointは残さない。

## 識別名とメッセージの表記

このAPIのmodule・execution・middlewareの識別名、例外、HTTPのエラー本文、WSの既定close reasonとexampleの起動ログは英語に揃える。資料本文・コメント・テスト名は日本語とし、コード例・エラーの期待値は実装と一致させる。ユーザー表示名などのサンプルデータやUTF-8検証用の文字列とは区別する。

GraphQL exampleではApplicationに渡すLoggerを起動コードと共有し、接続先を構造化ログで出力する。resolverの障害ログはDIしたLoggerへ渡す。

コードの空行は、入力確認、認証・検証、stateの作成、後処理などのまとまりを区切るために入れる。オブジェクトの設定項目の間へ意味のない空行を置かず、factory内の各handlerや関数定義の間は読み分けられるようにする。
