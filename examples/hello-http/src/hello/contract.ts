import { http } from '@loutrejs/http'
import { z } from 'zod'

export const AppContract = http.contract({
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
  },
})
