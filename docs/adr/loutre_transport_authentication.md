# HTTP / GraphQL WebSocketの共通認証

ステータス: Accepted

## 決定

通常のHTTP middleware `bearerAuth`とGraphQL Runtimeへ、同じ`authenticate`関数を渡す。認証サービスはtokenを検証して利用者を返し、adapterは資格情報の取得・失敗の変換・認証結果の寿命を所有する。Policyオブジェクト、新しいpackage、認証設定のregistryは導入しない。

```ts
factory: (users = inject(UserRepository)) => ({
  authenticate: (token, { signal }) => users.authenticate(token, { signal }),
  // HTTPではunauthorized、GraphQLではcontextを定義する。
})
```

共通契約は`BearerAuthenticator<TIdentity>`である。

```ts
type BearerAuthenticator<TIdentity extends object> = (
  token: string,
  input: { readonly signal: AbortSignal },
) => TIdentity | null | undefined | Promise<TIdentity | null | undefined>
```

成功は利用者のオブジェクト、拒否は`null` / `undefined`、認証サービスの障害は例外とする。JWTの方式・署名・期限やDB照合はサービス側の責務である。booleanやack payloadを認証結果として兼用しない。

## 取得・変換・型

HTTPの`Authorization`、GraphQL WSの`connection_init.payload.authorization`またはopening requestのヘッダーからBearer tokenを取得する。共通の`authenticateBearer`がBearer解析と認証呼び出し・中断を行い、HTTP / GraphQL adapterがprotocolの応答へ変換する。共通関数と型は既存の`@loutrejs/loutre/http`から公開し、CoreがGraphQLへ依存する構造を作らない。

WSで複数の取得元を同時に指定したら4400で拒否する。payloadが不正でもヘッダーへfallbackしない。payloadのキーは`authorization`だけとし、URL queryや別名を増やさない。

| 経路         | 成功時の受け渡し                 | 拒否                            | 障害                 |
| ------------ | -------------------------------- | ------------------------------- | -------------------- |
| 通常のHTTP   | middlewareの`ctx.state.identity` | 401とWWW-Authenticate challenge | 既存HTTPのエラー処理 |
| GraphQL HTTP | `context({ identity })`          | 401とWWW-Authenticate: Bearer   | 詳細を隠した500      |
| GraphQL WS   | `context({ identity })`          | 4403で接続終了                  | 詳細を隠した1011     |

GraphQLの認証は`factory.authenticate`を両transportで使う。認証をHTTP middlewareへ重複登録しない。未指定なら公開endpointとして扱い、Contextの`identity`はundefined。指定時はauthenticateの戻り値から利用者の型を推論し、成功した利用者だけをContextに渡す。HTTP独自のmiddlewareだけを置いてもWSは認証されない。

通常のHTTPでもauthenticateの戻り値をidentityとして渡す。独自のstate propertyへ認証結果を展開する分岐を残さず、両adapterで同じ利用者を扱う。必要な別のstateは通常のmiddlewareで追加する。

## 寿命と中断

HTTPではリクエストごとに本文のGraphQL処理より前に認証する。CORSやrate limitは既存HTTP middlewareで先に処理できる。WSではinit時に認証が成功してからpayloadなしのackを返し、operation開始時にも認証する。identityや生tokenをクライアントへ自動送信しない。

接続の資格情報はその接続だけ、認証結果とResolver Contextはそのoperationだけで保持する。共有Runtimeへ保存せず、同じ利用者でもData Resolution Scopeは共有しない。認証結果の自動cacheも導入しない。

HTTP / 接続 / operationの中断でsignalをabortする。authenticateがabortに協調しなくてもadapterは待機を終了し、遅い成功でackやResolverを再開しない。認証サービスへのtimeoutはサービスがsignalと合成して設定する。独立したtimeout用APIや認証結果の期限付きSession型を今回追加しない。

開始済みSubscriptionの即時失効やJWT期限での能動的切断は、この共通認証だけでは提供しない。後続operationで失効が検出されたら接続全体を終了する。継続中の配送に即時失効が必要な場合は、アプリケーションの失効通知や配送ごとの認可で扱う。操作権限不足はoperation / fieldの認可エラーとし、資格情報失効と混同して別の購読を終了しない。

## 検証

同じDIサービスのauthenticateを通常HTTP・GraphQL HTTP・GraphQL WSへ接続し、資格情報の取り出し、利用者の型、401 / 4403の拒否と内部障害の区別を検証する。別の接続と並列operationでidentityが混ざらず、認証中の切断・complete・drainで遅い結果を採用しないことを保証する。公開endpointの従来のQuery / Subscription / formatErrorとtransport型推論も維持する。

## 参照

- [GraphQL transport ADR](loutre_graphql_transport_architecture.md)
- [HTTP Bearer認証](https://www.rfc-editor.org/rfc/rfc6750#section-2.1)
- [GraphQL over WebSocket Protocol](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
