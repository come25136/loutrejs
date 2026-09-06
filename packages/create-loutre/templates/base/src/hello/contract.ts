import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const AppContract = http.contract({
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
  },
})
