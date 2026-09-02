import { implementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { ProfileContract } from './contract.js'

export const ProfileController = implementation({
  name: 'ProfileController',
  contract: ProfileContract,
  protocol: http,
  factory: () => ({
    get(ctx) {
      return ctx.response.ok({ body: ctx.currentUser })
    },
  }),
})
