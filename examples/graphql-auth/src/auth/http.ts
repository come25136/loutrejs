import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { authenticate, type AuthState } from './authentication.js'
import { Users } from './users.js'

export const authentication = http.middleware<AuthState>({
  name: '認証',
  factory:
    (users = inject(Users)) =>
    async ({ request, signal }, next) => {
      const state = authenticate(users, { request, signal })
      return state instanceof Response ? state : next(state)
    },
})

const profile = http.contract({
  me: {
    method: 'GET',
    path: '/me',
    middlewares: [authentication],
    responses: {
      ok: { status: 200, body: z.object({ id: z.string(), name: z.string() }) },
    },
  },
})

export const Profile = http.implementation({
  name: 'Profile',
  contract: profile,
  factory: (users = inject(Users)) => ({
    me: ({ state, response }) =>
      response.ok({ body: users.get(state.currentUser.id) }),
  }),
})
