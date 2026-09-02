import { contract } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const AppContract = contract([
  http({
    greet: {
      method: 'GET',
      path: '/{name}',
      request: {
        params: {
          name: z.string().min(2),
        },
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({ message: z.string() }),
        },
      },
      pipeline: [validate.params, http.controller],
    },
  }),
])
