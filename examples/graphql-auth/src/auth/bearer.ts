import { inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import { Users } from './users.js'
import type { AuthState } from './state.js'

export const httpBearerAuthentication = bearerAuth({
  name: 'HTTP Bearer認証',
  realm: 'GraphQL Profile',
  factory: (users = inject(Users)) => ({
    authenticate(token): AuthState | undefined {
      const user = users.authenticate({ authorization: `Bearer ${token}` })
      return user ? { currentUser: { id: user.id } } : undefined
    },
    unauthorized: () =>
      Response.json({ error: '認証が必要です。' }, { status: 401 }),
  }),
})
