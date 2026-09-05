import { bearerAuth } from '@loutrejs/http'
import { UserRepository } from '../auth/repository.js'

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  inject: [UserRepository],
  factory: (users) => ({
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
