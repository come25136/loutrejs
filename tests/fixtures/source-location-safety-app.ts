import { application, module } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { EventEmitter } from 'node:events'

declare class AmbientOnlyType {}

function externalClass() {
  return EventEmitter
}

const ExternalAlias = externalClass()

const Contract = http.contract({
  create: {
    method: 'POST',
    path: '/safety',
    responses: { ok: { status: 200 } },
  },
})

const Controller = http.implementation({
  name: 'SafetyController',
  contract: Contract,
  factory: () => ({
    create() {
      return { schema: Contract.create.ok }
    },
  }),
})

const Module = module(() => ({
  name: 'SafetyModule',
  providers: [ExternalAlias],
  executions: [Controller],
}))

export default application({ modules: [Module()] })
