import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { Users, type User } from './users.js'

export const authentication = http.middleware<{ currentUser: User }>({
  name: '認証',
  factory:
    (users = inject(Users)) =>
    async ({ request }, next) => {
      const currentUser = users.authenticate({
        authorization: request.headers.get('authorization'),
        apiKey: request.headers.get('x-api-key'),
      })
      if (!currentUser)
        return Response.json({ error: '認証が必要です。' }, { status: 401 })
      return next({ currentUser })
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
  factory: () => ({
    me: ({ state, response }) => response.ok({ body: state.currentUser }),
  }),
})
