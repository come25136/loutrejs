import * as loutre from '@loutrejs/loutre'
import * as httpApi from '@loutrejs/loutre/http'

const VALUE = loutre.token<string>('source-location.namespace-value')
const builder = loutre.provide(VALUE)
const valueProvider = builder.useValue('namespace')

const audit = httpApi.defineHttpMiddleware({
  name: 'namespaceAudit',
  factory: () => async (_context, next) => {
    await next()
  },
})

const Contract = httpApi.http.contract({
  get: {
    method: 'GET',
    path: '/namespace',
    middlewares: [audit],
    responses: { ok: { status: 200 } },
  },
})

const Controller = httpApi.http.implementation({
  name: 'NamespaceController',
  contract: Contract,
  factory: () => ({
    get(ctx) {
      return ctx.response.ok({})
    },
  }),
})

const Module = loutre.defineModule(() => ({
  name: 'NamespaceModule',
  providers: [valueProvider],
  executions: [Controller],
}))

export default loutre.defineApplication({ modules: [Module()] })
