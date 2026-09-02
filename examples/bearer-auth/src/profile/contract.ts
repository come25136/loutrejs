import { contract } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { bearerAuthentication } from '../layers/authentication.js'
import { User } from '../auth/user.js'

const UnauthorizedBody = z.object({
  error: z.string(),
})

export const BearerProfileContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/profile',
      responses: {
        ok: {
          status: 200,
          body: User,
        },
        unauthorized: {
          status: 401,
          body: UnauthorizedBody,
          headers: z.object({ 'www-authenticate': z.string() }),
        },
      },
      pipeline: [bearerAuthentication, http.controller],
    },
  }),
])
