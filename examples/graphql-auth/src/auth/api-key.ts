import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { Users } from './users.js'
import type { AuthState } from './state.js'

export const httpApiKeyAuthentication = http.middleware<AuthState>({
  name: 'HTTP API key認証',
  factory:
    (users = inject(Users)) =>
    async ({ request, signal }, next) => {
      signal.throwIfAborted()
      const user = users.authenticate({
        apiKey: request.headers.get('x-api-key'),
      })
      if (!user)
        return Response.json({ error: '認証が必要です。' }, { status: 401 })
      return next({ currentUser: { id: user.id } })
    },
})
