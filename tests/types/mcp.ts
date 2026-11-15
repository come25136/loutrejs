import { mcp } from '@loutrejs/mcp'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const input = z.object({ id: z.string().transform(Number) })
const output = z.object({ id: z.number().transform(String).pipe(z.string()) })
const read = mcp.tool({
  name: 'get_order',
  description: '注文を取得する',
  scopes: ['read'],
  input,
  output,
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
  tools: [read],
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
  tools: [read],
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
  tools: [read],
  factory: () => ({
    oauth,
    context: () => ({}),
    // @ts-expect-error 公開したToolに対応するhandlerが必要
    tools: {},
  }),
})
mcp.tool({
  name: 'invalid',
  description: 'Toolは契約だけを持つ',
  scopes: [],
  input,
  output,
  // @ts-expect-error DIのfactoryはendpointへ置く
  factory: () => () => ({ id: 1 }),
})
