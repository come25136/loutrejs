import { http } from '@loutrejs/loutre/http'
import { ProfileContract } from './contract.js'

export const ProfileController = http.implementation({
  name: 'ProfileController',
  contract: ProfileContract,
  factory: () => ({
    get(ctx) {
      return { schema: ProfileContract.get.ok, body: ctx.state.currentUser }
    },
  }),
})
