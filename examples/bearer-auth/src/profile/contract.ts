import { http } from '@loutrejs/http'
import { z } from 'zod'
import { User } from '../auth/user.js'
import { bearerAuthentication } from '../layers/authentication.js'

const UnauthorizedBody = z.object({ error: z.string() })

export const BearerProfileContract = http.contract({
  get: {
    method: 'GET',
    path: '/profile',
    responses: {
      ok: { status: 200, body: User },
      unauthorized: { status: 401, body: UnauthorizedBody },
    },
    layers: [bearerAuthentication],
  },
})
