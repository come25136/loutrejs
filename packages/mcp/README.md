# MCP endpoint

HTTP ContractのルートからStreamable HTTPでToolを公開します。endpointごとのfactoryがruntimeとDIを所有し、同じHTTP listenerへ複数endpointを登録できます。

```ts
const OrdersContract = mcp.contract({
  'orders.read': {
    description: '注文を取得する',
    scopes: ['orders:read'],
    input: z.object({ id: z.string() }),
    output: z.object({ status: z.string() }),
  },
})
const OrdersMcp = mcp.implementation({
  name: 'orders',
  version: '1.0.0',
  route: ApiContract.routes.orders,
  contract: OrdersContract,
  oauth: { requiredScopes: ['orders:read'] },
  factory: (orders = inject(OrdersService), auth = inject(AuthService)) => ({
    oauth: auth.mcp,
    tools: {
      'orders.read': async ({ input: { id }, principal, signal }) => ({
        status: await orders.status(id, { principal, signal }),
      }),
    },
  }),
})
```

`mcp.contract` はTool一覧・各Tool定義・`scopes` 配列をコピーして凍結します。`input` と `output` には渡したスキーマをそのまま使うため、宣言後も同じ検証動作を保つスキーマを渡してください。Tool一覧のキーには文字列を使います。列挙できないものを含め、一覧に直接定義されたSymbolキーは宣言時にエラーになります。

endpoint の `oauth` に設定オブジェクトを指定すると OAuth が有効になります。追加の scope や Origin の設定が不要な場合は `oauth: {}` を指定します。認証付き endpoint の `factory` は `oauth` と `tools` を返します。factory で注入した Provider は、同じ Application のその endpoint 内で共有します。

Tool ハンドラは1つのオブジェクトを受け取ります。`input` は Tool のスキーマで検証・変換した値です。必要に応じて、同じ引数から検証済みの `principal`、中断用の `signal`、HTTP の `request`、middleware の `state` を取り出せます。`state` の型は endpoint の HTTP ルートから推論されます。

`runtime.oauth`には`publicOrigin`、`authorizationServers`、`verifyAccessToken`、`allowInvocation`を指定します。署名またはイントロスペクションの結果を検証し、トークンの主体・発行元・リソース・期限・scopeを返してください。一覧と直接呼び出しには同じscope条件を適用します。

Toolから公開する業務エラーは`throw mcp.toolError(message)`で返します。通常の例外は内部エラーとして扱います。外部I/OにはContextで受け取ったsignalを渡してください。

## OAuth なしで使う

`mcp.implementation` の `oauth` を省略すると認証なしの endpoint になります。factory は `tools` だけを返し、各 Tool の `scopes` は `[]` にします。Tool の `principal` は `undefined` です。OAuth メタデータのルートは登録されません。

既定で許可する Host は `localhost`、`127.0.0.1`、`[::1]` です。別のホスト名で公開する場合は endpoint の `allowedHosts` にホスト名を指定します。SDK クライアントはトークンなしで接続できます。[Hello MCP の実行例](../../examples/hello-mcp/README.md)

[カウンターの実行例](../../examples/mcp-counter/README.md)と[設計と状態の寿命](../../docs/adr/loutre_mcp_server_architecture.md)を参照してください。
