import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { Users } from '../auth/users.js'
import type { AuthState } from '../auth/state.js'

const httpAuthentication = http.middleware<Partial<AuthState>>({
  name: 'HttpAuthentication',
  factory:
    (users = inject(Users)) =>
    async ({ request, signal }, next) => {
      signal.throwIfAborted()
      if (http.isWebSocketUpgrade(request)) return next()

      const user = users.authenticate({
        authorization: request.headers.get('authorization'),
        apiKey: request.headers.get('x-api-key'),
      })
      if (!user)
        return Response.json(
          { error: 'Authentication required.' },
          {
            status: 401,
            headers: { 'www-authenticate': 'Bearer realm="GraphQL Profile"' },
          },
        )

      return next({ currentUser: { id: user.id } })
    },
})

export const ApiContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 204 } },
  },
  graphql: {
    raw: true,
    method: '*',
    path: '/graphql',
    middlewares: [httpAuthentication],
  },
})

export const HealthHttp = http.implementation({
  name: 'HealthHttp',
  contract: ApiContract,
  factory: () => ({ health: (ctx) => ctx.response.ok({}) }),
})
