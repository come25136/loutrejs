import { basicAuth } from '@loutrejs/http'
import { UserRepository } from '../auth/repository.js'

export const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  inject: [UserRepository],
  factory: (users) => ({
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
