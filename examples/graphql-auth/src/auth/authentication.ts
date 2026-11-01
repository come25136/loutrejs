import { defineLayer, inject } from '@loutrejs/loutre'
import type { GraphQLMiddlewareContext } from '@loutrejs/graphql'
import { Users, type User } from './users.js'

export interface AuthState {
  readonly currentUser: Pick<User, 'id'>
}

export const authentication = defineLayer<
  AuthState,
  GraphQLMiddlewareContext,
  Response
>({
  name: '認証',
  factory:
    (users = inject(Users)) =>
    async ({ request, connectionParams, signal }, next) => {
      signal.throwIfAborted()
      const headers = request.headers
      const credentials =
        headers.has('authorization') || headers.has('x-api-key')
          ? {
              authorization: headers.get('authorization'),
              apiKey: headers.get('x-api-key'),
            }
          : (connectionParams ?? {})
      const user = users.authenticate(credentials)
      if (!user)
        return Response.json({ error: '認証が必要です。' }, { status: 401 })
      return next({ currentUser: { id: user.id } })
    },
})
