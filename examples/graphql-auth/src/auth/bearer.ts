import { defineLayer, inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import type { GraphQLConnectionInitContext } from '@loutrejs/graphql'
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

export const wsBearerAuthentication = defineLayer<
  AuthState,
  GraphQLConnectionInitContext,
  Response
>({
  name: 'ConnectionInit Bearer認証',
  factory:
    (users = inject(Users)) =>
    async ({ payload, signal }, next) => {
      signal.throwIfAborted()
      const user = users.authenticate({ authorization: payload?.authorization })
      if (!user)
        return Response.json({ error: '認証が必要です。' }, { status: 401 })
      return next({ currentUser: { id: user.id } })
    },
})
