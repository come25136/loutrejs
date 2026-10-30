import { inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import { UserRepository } from '../auth/repository.js'

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  factory: (users = inject(UserRepository)) => ({
    authenticate(token) {
      return users.authenticate(token)
    },
    unauthorized() {
      return {
        response: 'unauthorized',
        body: { error: 'Bearer token required' },
      }
    },
  }),
})
