import { http } from '@loutrejs/loutre/http'
import { BearerProfileContract } from './contract.js'

export const BearerProfileController = http.implementation({
  name: 'BearerProfileController',
  contract: BearerProfileContract,
  factory: () => ({
    get(ctx) {
      return ctx.response.ok({ body: ctx.state.currentUser })
    },
  }),
})
