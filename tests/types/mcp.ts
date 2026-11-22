import { mcp } from '@loutrejs/mcp'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const input = z.object({ id: z.string().transform(Number) })
const output = z.object({ id: z.number().transform(String).pipe(z.string()) })
const OrdersContract = mcp.contract({
  get_order: {
    description: '注文を取得する',
    scopes: ['read'],
    input,
    output,
  },
})
const layer = http.middleware<{ tenant: string }>({
  name: 'Tenant',
  factory: () => async (_input, next) => next({ tenant: '組織1' }),
})
const route = http.contract({
  endpoint: { raw: true, method: '*', path: '/mcp', middlewares: [layer] },
}).routes.endpoint
const oauth = {
  publicOrigin: 'https://example.test',
  authorizationServers: ['https://issuer.example.test'],
  verifyAccessToken: () => undefined,
  allowInvocation: () => true,
}

mcp.implementation({
  name: 'orders',
  version: '1',
  route,
  contract: OrdersContract,
  factory: () => ({
    oauth,
    tools: {
      get_order({ principal, input: { id }, signal, state, request }) {
        const tenant: string = state.tenant
        const original: Request = request
        const subject: string = principal.subject
        const orderId: number = id
        // @ts-expect-error middlewareが宣言していないstateを使わない
        void state.secret
        signal.throwIfAborted()
        void [tenant, original]
        return { id: orderId + subject.length }
      },
    },
  }),
})

const PublicContract = mcp.contract({
  greet: { description: '挨拶', scopes: [], input, output },
})
mcp.implementation({
  name: 'public',
  version: '1',
  route,
  contract: PublicContract,
  oauth: false,
  factory: () => ({
    tools: {
      greet({ principal, input: { id }, state }) {
        const anonymous: undefined = principal
        // @ts-expect-error 匿名の呼び出しに認証主体はない
        void principal.subject
        void anonymous
        return { id: id + state.tenant.length }
      },
    },
  }),
})

mcp.implementation({
  name: 'invalid',
  version: '1',
  route,
  contract: OrdersContract,
  factory: () => ({
    oauth,
    tools: {
      // @ts-expect-error 出力schemaへの入力にはnumberが必要
      get_order: () => ({ id: '17' }),
    },
  }),
})
mcp.implementation({
  name: 'missing',
  version: '1',
  route,
  contract: OrdersContract,
  factory: () => ({
    oauth,
    // @ts-expect-error 公開したToolに対応するhandlerが必要
    tools: {},
  }),
})
mcp.contract({
  invalid: {
    description: 'Toolは契約だけを持つ',
    scopes: [],
    input,
    output,
    // @ts-expect-error DIのfactoryはendpointへ置く
    factory: () => () => ({ id: 1 }),
  },
})

mcp.implementation({
  name: 'extra',
  version: '1',
  route,
  contract: OrdersContract,
  factory: () => ({
    oauth,
    // @ts-expect-error ContractにないToolを実装できない
    tools: { get_order: () => ({ id: 1 }), other: () => ({ id: 2 }) },
  }),
})

const mutableTools = {
  read: {
    description: '確認',
    scopes: ['read'],
    input: z.object({}),
    output: z.object({}),
  },
}
const readonlyToolsContract = mcp.contract(mutableTools)
// @ts-expect-error スナップショットのscopeは読み取り専用
readonlyToolsContract.tools.read.scopes.push('write')
// @ts-expect-error スナップショットの定義は読み取り専用
readonlyToolsContract.tools.read.description = '変更'
