import { http } from '@loutrejs/http'
import { ProfileContract } from './contract.js'

export const ProfileController = http.implementation({
  name: 'ProfileController',
  contract: ProfileContract,
  factory: () => ({
    get(ctx) {
      return ctx.response.ok({ body: ctx.state.currentUser })
    },
  }),
})
