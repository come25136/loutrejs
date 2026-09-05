import { http } from '@loutrejs/http'
import type { User } from '../auth/user.js'
import { AppContract } from '../contract.js'

export const ProfileController = http.implementation({
  name: 'ProfileController',
  contract: AppContract,
  factory: () => ({
    profile(ctx) {
      const currentUser: User = ctx.state.currentUser
      return ctx.response.ok({ body: currentUser })
    },
  }),
})
