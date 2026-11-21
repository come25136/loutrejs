import { http } from '@loutrejs/loutre/http'
import { BearerProfileContract } from './contract.js'

export const BearerProfileController = http.implementation({
  name: 'BearerProfileController',
  contract: BearerProfileContract,
  factory: () => ({
    get(ctx) {
      return {
        schema: BearerProfileContract.get.ok,
        body: ctx.state.currentUser,
      }
    },
  }),
})
