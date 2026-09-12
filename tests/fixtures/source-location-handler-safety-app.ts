import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'

const ReassignedContract = http.contract({
  create: {
    method: 'POST',
    path: '/reassigned',
    responses: { ok: { status: 200 } },
  },
})

const oldFactory = () => ({
  create(ctx: any) {
    return ctx.response.ok({ factory: 'old' })
  },
})

const realFactory = () => ({
  create(ctx: any) {
    return ctx.response.ok({ factory: 'real' })
  },
})

let selectedFactory = oldFactory
selectedFactory = realFactory

const ReassignedController = http.implementation({
  name: 'ReassignedController',
  contract: ReassignedContract,
  factory: selectedFactory,
})

const BranchContract = http.contract({
  create: {
    method: 'POST',
    path: '/branch',
    responses: { ok: { status: 200 } },
  },
})

const useFirst = true
const BranchController = http.implementation({
  name: 'BranchController',
  contract: BranchContract,
  factory: () => {
    if (useFirst) {
      return {
        create(ctx) {
          return ctx.response.ok({})
        },
      }
    }
    return {
      create(ctx) {
        return ctx.response.ok({})
      },
    }
  },
})

const MutatedContract = http.contract({
  create: {
    method: 'POST',
    path: '/mutated-implementation',
    responses: { ok: { status: 200 } },
  },
})

const implementation = {
  name: 'MutatedController',
  contract: MutatedContract,
  factory: oldFactory,
}
implementation.factory = realFactory
const MutatedController = http.implementation(implementation)

const SpreadContract = http.contract({
  create: {
    method: 'POST',
    path: '/spread-handler',
    responses: { ok: { status: 200 } },
  },
})
const actualHandlers: Record<string, (...args: any[]) => unknown> = {
  create(ctx: any) {
    return ctx.response.ok({})
  },
}
const SpreadController = http.implementation({
  name: 'SpreadController',
  contract: SpreadContract,
  factory: () => ({
    create() {
      throw new Error('decoy handler must never provide source metadata')
    },
    ...actualHandlers,
  }),
})

const Module = defineModule(() => ({
  name: 'HandlerSafetyModule',
  executions: [
    ReassignedController,
    BranchController,
    MutatedController,
    SpreadController,
  ],
}))

export default defineApplication({ modules: [Module()] })
