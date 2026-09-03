import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { BearerProfileContract } from './contract.js'

export const BearerProfileController = defineImplementation({
  name: 'BearerProfileController',
  contract: BearerProfileContract,
  protocol: http,
}).factory(() => ({
  get(ctx) {
    return ctx.response.ok({ body: ctx.state.currentUser })
  },
}))
