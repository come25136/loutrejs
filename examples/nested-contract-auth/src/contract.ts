import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { authentication } from './layers/authentication.js'
import { ProfileContract } from './profile/contract.js'

const profile = ProfileContract.routes.profile

export const AppContract = http.contract({
  profile: {
    method: profile.method,
    path: `/api/me${profile.path}`,
    responses: {
      ok: profile.responses.ok,
      unauthorized: {
        status: 401,
        body: z.object({ error: z.string() }),
        headers: z.object({ 'www-authenticate': z.string() }),
      },
    },
    middlewares: [authentication],
  },
})
