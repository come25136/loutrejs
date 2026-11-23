import * as loutre from '@loutrejs/loutre'
import * as httpApi from '@loutrejs/loutre/http'

function nestedServiceModule() {
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
      create() {
        return { schema: Contract.create.ok }
      },
    }),
  })

  return loutre.module(() => ({
    name: 'NamespaceNestedModule',
    providers: [NestedService],
    executions: [Controller],
  }))
}

const Module = nestedServiceModule()

export default loutre.application({ modules: [Module()] })
