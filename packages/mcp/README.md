# MCP endpoint

HTTP ContractのルートからStreamable HTTPでToolを公開します。endpointごとのfactoryがruntimeとDIを所有し、同じHTTP listenerへ複数endpointを登録できます。

```ts
const read = mcp.tool({
  name: 'orders.read',
  description: '注文を取得する',
  scopes: ['orders:read'],
  input: z.object({ id: z.string() }),
  output: z.object({ status: z.string() }),
})
const OrdersMcp = mcp.implementation({
  name: 'orders',
  version: '1.0.0',
  route: Api.routes.orders,
  tools: [read],
  oauth: { requiredScopes: ['orders:read'] },
  factory: (orders = inject(OrdersService), auth = inject(AuthService)) => ({
    oauth: auth.mcp,
    context: ({ principal, signal, state }) => ({ principal, signal, state }),
    tools: {
      'orders.read': async ({ id }, context) => ({
        status: await orders.status(id, context),
      }),
    },
  }),
})
```

`factory`と`context`は必須です。factoryはApplicationごとのendpointにつき一度実体を作り、Contextは認可と入力検証後のTool呼び出しごとに作ります。factoryで保持するtransient Providerもそのendpointの呼び出し間で共有します。

Contextの入力は`request`、middlewareの`state`、検証済みの`principal`、`signal`です。呼び出しごとの可変状態はContextで構築してください。Tool handlerの入出力とContextは契約から型推論されます。

`runtime.oauth`には`publicOrigin`、`authorizationServers`、`verifyAccessToken`、`allowInvocation`を指定します。署名またはイントロスペクションの結果を検証し、トークンの主体・発行元・リソース・期限・scopeを返してください。一覧と直接呼び出しには同じscope条件を適用します。

Toolから公開する業務エラーは`throw mcp.toolError(message)`で返します。通常の例外は内部エラーとして扱います。外部I/OにはContextで受け取ったsignalを渡してください。

[カウンターの実行例](../../examples/mcp-counter/README.md)と[設計と状態の寿命](../../docs/adr/loutre_mcp_server_architecture.md)を参照してください。
