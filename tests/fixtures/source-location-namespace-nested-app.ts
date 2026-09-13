import * as loutre from '@loutrejs/loutre'
import * as httpApi from '@loutrejs/loutre/http'

function createModule() {
  class NestedService {}

  const Contract = httpApi.http.contract({
    create: {
      method: 'POST',
      path: '/namespace-nested',
      responses: { ok: { status: 200 } },
    },
  })

  const Controller = httpApi.http.implementation({
    name: 'NamespaceNestedController',
    contract: Contract,
    factory: () => ({
      create(ctx) {
        return ctx.response.ok({})
      },
    }),
  })

  return loutre.defineModule(() => ({
    name: 'NamespaceNestedModule',
    providers: [NestedService],
    executions: [Controller],
  }))
}

const Module = createModule()

export default loutre.defineApplication({ modules: [Module()] })
