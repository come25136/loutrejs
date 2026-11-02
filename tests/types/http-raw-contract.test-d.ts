import {
  http,
  createHttpClient,
  type HttpContractRawRoute,
} from '@loutrejs/loutre/http'
const layer = http.middleware<{ tenant: string }>({
  name: 'Tenant',
  factory: () => async (_input, next) => next({ tenant: 'もみじ' }),
})
const api = http.contract({
  api: {
    path: '/api',
    middlewares: [layer],
    routes: {
      regular: {
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 204 } },
      },
      delegated: { raw: true, method: '*', path: '/graphql' },
    },
  },
})
const path: '/api/graphql' = api.routes.delegated.path
const raw: HttpContractRawRoute = api.routes.delegated
void [path, raw]
http.implementation({
  contract: api,
  factory: () => ({
    regular: (ctx) => {
      const tenant: string = ctx.state.tenant
      void tenant
      return ctx.response.ok({})
    },
  }),
})
http.raw({
  route: api.routes.delegated,
  factory: () => (ctx) => {
    const tenant: string = ctx.state.tenant
    // @ts-expect-error 宣言していないstateを渡さない
    ctx.state.missing
    return new Response(tenant)
  },
})
const client = createHttpClient(api, async () => ({
  status: 204,
  body: undefined,
}))
client.regular()
// @ts-expect-error rawルートは型付きHTTP clientから呼び出さない
client.delegated()
// @ts-expect-error rawを明示せずresponsesを省略しない
http.contract({ invalid: { method: 'GET', path: '/invalid' } })
http.contract({
  invalid: {
    // @ts-expect-error rawルートにHTTP response variantを定義しない
    raw: true,
    method: '*',
    path: '/invalid',
    responses: { ok: { status: 200 } },
  },
})
// @ts-expect-error rawルートへHTTP response variantを継承しない
http.contract({
  api: {
    responses: { unauthorized: { status: 401 } },
    routes: { invalid: { raw: true, method: '*', path: '/invalid' } },
  },
})
// @ts-expect-error 正規化していないrawルートを契約の参照として扱わない
const unbound: HttpContractRawRoute = {
  raw: true,
  method: '*',
  path: '/invalid',
}
void unbound
