import { basicAuth } from '@loutrejs/http'

export const authentication = basicAuth({
  name: 'authentication',
  realm: 'Loutre Nested Contract Example',
  factory: () => ({
    authenticate({ username, password }) {
      if (username !== 'loutre' || password !== 'otter') return undefined
      return { currentUser: { id: 'user-1', name: 'Loutre User' } }
    },
    unauthorized() {
      return {
        response: 'unauthorized',
        body: { error: 'Authentication required' },
      }
    },
  }),
})
