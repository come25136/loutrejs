import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export default http.contract({
  getUser: {
    method: 'GET',
    path: '/users/{id}',
    summary: 'Get user',
    request: {
      params: {
        id: z.string(),
      },
    },
    responses: {
      ok: {
        status: 200,
        body: z.object({
          id: z.string(),
          name: z.string(),
        }),
      },
    },
  },
  createUser: {
    method: 'POST',
    path: '/users',
    request: {
      headers: z.object({
        'content-type': z.literal('application/json'),
      }),
      body: z.object({
        name: z.string(),
      }),
    },
    responses: {
      created: {
        status: 201,
        body: z.object({
          id: z.string(),
          name: z.string(),
        }),
      },
    },
  },
})
