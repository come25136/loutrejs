import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { ProfileContract } from './contract.js'

export const ProfileController = defineImplementation({
  name: 'ProfileController',
  contract: ProfileContract,
  protocol: http,
}).factory(() => ({
  get(ctx) {
    return ctx.response.ok({ body: ctx.state.currentUser })
  },
}))
