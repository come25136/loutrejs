import { contract } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const HelloContract = contract([
  http({
    hello: {
      method: 'GET',
      path: '/',
      responses: {
        ok: {
          status: 200,
          body: z.object({
            message: z.string(),
          }),
        },
      },
      pipeline: [http.controller],
    },
  }),
])

export const AppContract = contract([
  http({
    app: {
      routes: HelloContract.http,
    },
  }),
])
