import { defineApplication, defineModule } from '@loutrejs/loutre'
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

const handlers = {
  create() {
    throw new Error('decoy handler must never be used')
  },
}

function makeHandlers() {
  return {
    create(ctx: any) {
      return ctx.response.ok({})
    },
  }
}

const Controller = http.implementation({
  name: 'SafetyController',
  contract: Contract,
  factory: () => {
    // eslint-disable-next-line no-shadow
    const handlers = makeHandlers()
    return handlers
  },
})

const Module = defineModule(() => ({
  name: 'SafetyModule',
  providers: [ExternalAlias],
  executions: [Controller],
}))

void handlers

export default defineApplication({ modules: [Module()] })
