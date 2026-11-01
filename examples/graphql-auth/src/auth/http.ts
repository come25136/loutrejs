import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { authentication } from './authentication.js'
import { Users } from './users.js'

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

export const ProfileHttp = http.implementation({
  name: 'ProfileHttp',
  contract: profile,
  factory: (users = inject(Users)) => ({
    me: ({ state, response }) =>
      response.ok({ body: users.get(state.currentUser.id) }),
  }),
})
