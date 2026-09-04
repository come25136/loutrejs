import { inject, type } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import { UserRepository } from '../auth/repository.js'
import type { User } from '../auth/user.js'

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  state: type<{
    currentUser: User
  }>(),
  factory: (users = inject(UserRepository)) => ({
    authenticate(token) {
      const currentUser = users.authenticate(token)
      return currentUser === undefined ? undefined : { currentUser }
    },
    unauthorized() {
      return {
        response: 'unauthorized',
        body: { error: 'Bearer token required' },
      }
    },
  }),
})
