import { http } from '@loutrejs/http'
import { z } from 'zod'
import { authentication } from './layers/authentication.js'
import { ProfileContract } from './profile/contract.js'

const profile = ProfileContract.routes.profile

export const AppContract = http.contract({
  profile: {
    ...profile,
    path: `/api/me${profile.path}`,
    responses: {
      ...profile.responses,
      unauthorized: {
        status: 401,
        body: z.object({ error: z.string() }),
      },
    },
    middlewares: [authentication],
  },
})
