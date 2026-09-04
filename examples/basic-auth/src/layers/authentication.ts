import { inject, type } from '@loutrejs/loutre'
import { basicAuth } from '@loutrejs/loutre/http'
import { UserRepository } from '../auth/repository.js'
import type { User } from '../auth/user.js'

export const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  state: type<{
    currentUser: User
  }>(),
  factory: (users = inject(UserRepository)) => ({
    authenticate(credentials) {
      const currentUser = users.authenticate(credentials)
      return currentUser === undefined ? undefined : { currentUser }
    },
    unauthorized() {
      return {
        response: 'unauthorized',
        body: { error: 'Basic authentication required' },
      }
    },
  }),
})
