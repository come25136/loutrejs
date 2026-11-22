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
    context({ principal, signal, state, request }) {
      const tenant: string = state.tenant
      const original: Request = request
      // @ts-expect-error middlewareが宣言していないstateを使わない
      void state.secret
      signal.throwIfAborted()
      void original
      return { tenant, subject: principal.subject }
    },
    tools: {
      get_order({ id }, context) {
        const orderId: number = id
        const subject: string = context.subject
        const tenant: string = context.tenant
        void tenant
        // @ts-expect-error Contextが返していない値は使わない
        void context.secret
        return { id: orderId + subject.length }
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
    context: () => ({}),
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
    context: () => ({}),
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
    context: () => ({}),
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
