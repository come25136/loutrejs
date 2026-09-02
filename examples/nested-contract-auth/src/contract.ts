import { contract } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { authentication } from './layers/authentication.js'
import { ProfileContract } from './profile/contract.js'

export const AppContract = contract([
  http({
    api: {
      path: '/api',
      pipeline: [authentication],
      responses: {
        unauthorized: {
          status: 401,
          body: z.object({ error: z.string() }),
          headers: z.object({ 'www-authenticate': z.string() }),
        },
      },
      routes: {
        me: {
          path: '/me',
          routes: ProfileContract.http,
        },
      },
    },
  }),
])
