import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { authentication } from './layers/authentication.js'
import { ProfileContract } from './profile/contract.js'

export const AppContract = http.contract({
  api: {
    path: '/api',
    routes: {
      me: {
        path: '/me',
        responses: {
          unauthorized: {
            status: 401,
            body: z.object({ error: z.string() }),
            headers: z.object({ 'www-authenticate': z.string() }),
          },
        },
        middlewares: [authentication],
        routes: ProfileContract.routes,
      },
    },
  },
})
