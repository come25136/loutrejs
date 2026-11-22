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
      'orders.read': async ({ id }, { principal, signal }) => ({
        status: await orders.status(id, { principal, signal }),
      }),
    },
  }),
})
```

`mcp.contract` はTool一覧・各Tool定義・`scopes` 配列をコピーして凍結します。`input` と `output` には渡したスキーマをそのまま使うため、宣言後も同じ検証動作を保つスキーマを渡してください。Tool一覧のキーには文字列を使います。列挙できないものを含め、一覧に直接定義されたSymbolキーは宣言時にエラーになります。

endpoint の `factory` は `oauth` と `tools` を返します。factory で注入した Provider は、同じ Application のその endpoint 内で共有します。

Tool ハンドラの第1引数は検証後の入力です。第2引数の `McpToolContext` から `request`、HTTP middleware の `state`、検証済みの `principal`、中断用の `signal` を取得できます。`state` の型は endpoint の HTTP ルートから推論されます。Tool が入力だけで完結する場合は、第2引数を省略できます。

`runtime.oauth`には`publicOrigin`、`authorizationServers`、`verifyAccessToken`、`allowInvocation`を指定します。署名またはイントロスペクションの結果を検証し、トークンの主体・発行元・リソース・期限・scopeを返してください。一覧と直接呼び出しには同じscope条件を適用します。

Toolから公開する業務エラーは`throw mcp.toolError(message)`で返します。通常の例外は内部エラーとして扱います。外部I/OにはContextで受け取ったsignalを渡してください。

[カウンターの実行例](../../examples/mcp-counter/README.md)と[設計と状態の寿命](../../docs/adr/loutre_mcp_server_architecture.md)を参照してください。
