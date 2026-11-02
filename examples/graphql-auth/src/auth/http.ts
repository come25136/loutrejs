import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { Users } from './users.js'
import type { AuthState } from './state.js'

export const httpAuthentication = http.middleware<Partial<AuthState>>({
  name: 'HTTP認証',
  factory:
    (users = inject(Users)) =>
    async ({ request, signal }, next) => {
      signal.throwIfAborted()
      if (http.isWebSocketUpgrade(request)) return next({})
      const user = users.authenticate({
        authorization: request.headers.get('authorization'),
        apiKey: request.headers.get('x-api-key'),
      })
      if (!user)
        return Response.json(
          { error: '認証が必要です。' },
          {
            status: 401,
            headers: { 'www-authenticate': 'Bearer realm="GraphQL Profile"' },
          },
        )
      return next({ currentUser: { id: user.id } })
    },
})
