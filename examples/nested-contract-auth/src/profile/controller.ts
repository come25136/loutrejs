import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { AppContract } from '../contract.js'
import type { User } from '../auth/user.js'

export const ProfileController = defineImplementation({
  name: 'ProfileController',
  contract: AppContract.http.api.me.profile,
  protocol: http,
}).factory(() => ({
  profile(ctx) {
    const currentUser: User = ctx.state.currentUser
    return ctx.response.ok({ body: currentUser })
  },
}))
