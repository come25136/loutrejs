import { inject } from '@loutrejs/loutre'
import { basicAuth } from '@loutrejs/http'
import { UserRepository } from '../auth/repository.js'

export const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
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
