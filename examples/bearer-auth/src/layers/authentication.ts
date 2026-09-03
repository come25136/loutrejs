import { inject } from '@loutrejs/loutre'
import { defineBearerAuth } from '@loutrejs/loutre/http'
import { UserRepository } from '../auth/repository.js'

export const bearerAuthentication = defineBearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
}).factory((users = inject(UserRepository)) => ({
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
}))
