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
    context: ({ state, signal }) => ({
      currentUser: state.currentUser,
      users,
      signal,
    }),
  }),
})
```

raw: trueはHTTP request/responseの処理を委任する明示的な印である。responsesの書き忘れをrawとして受け付けない。rawルートはHTTP response variantとrequest body schemaを持たず、HTTP implementationのhandler一覧、型付きHTTP client、OpenAPIのoperationから除外する。単独のraw処理は既存のhttp.rawへ同じルートを渡して実装できる。raw: trueの参照はhttp.contractで正規化したものに限定し、未正規化のpathやmiddlewareをGraphQLへ直接渡す経路を設けない。

branchのpathとmiddlewareはrawルートにも継承する。branchで宣言したresponse variantは通常HTTP用であり、rawルートへ継承する組合せは型と実行時の両方で拒否する。GraphQLのHTTP入出力はmanifestとprotocolが所有するためである。

HTTP middlewareは通常のGraphQL HTTP要求へ適用し、Upgrade時には自動適用しない。ブラウザがConnectionInitで渡す資格情報を、Upgradeより前にHTTP Bearer認証で拒否しないためである。WS handshakeは同じContractのpathを照合し、共通WebSocket hostでGET以外を405とAllow: GETで拒否してからgraphql-transport-wsを交渉する。WSを有効にするルートはGETまたは*を受け付ける必要がある。接続確立後の認証とstate生成はGraphQL implementationのconnectionInitが所有する。

httpとwsの有効化は引き続き独立した静的設定とし、HTTPは既定で有効、WSは既定で無効にする。GraphQL実装側のhttp設定はbooleanだけとし、path・method・middlewareの上書きを廃止する。既存graphql.endpointは残さない。
