import { contract } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const RequestHeaders = z.union([
  z.object({
    'content-type': z.literal('application/json'),
  }),
  z.object({
    'content-type': z.literal('text/plain'),
    'x-custom-header': z.string(),
  }),
])

const RequestBody = z.union([z.object({ message: z.string() }), z.string()])

export const MessagesContract = contract([
  http({
    create: {
      method: 'POST',
      path: '/messages',
      request: {
        headers: RequestHeaders,
        body: RequestBody,
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({
            mediaType: z.enum(['application/json', 'text/plain']),
            message: z.string(),
            customHeader: z.string().nullable(),
          }),
        },
      },
      pipeline: [validate.headers, validate.body, http.controller],
    },
  }),
])
