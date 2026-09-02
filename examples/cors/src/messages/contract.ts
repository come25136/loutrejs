import { contract } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const CreateMessageBody = z.object({
  text: z.string().min(1),
})

const Message = z.object({
  id: z.string(),
  text: z.string(),
})

export const MessageContract = contract([
  http({
    create: {
      method: 'POST',
      path: '/messages',
      request: {
        body: {
          contentType: 'application/json',
          schema: CreateMessageBody,
        },
      },
      responses: {
        created: {
          status: 201,
          body: Message,
          staticHeaders: {
            'x-request-id': 'cors-example',
          },
        },
      },
      pipeline: [
        validate.cors({
          origin: ['http://localhost:5173'],
          allowMethods: ['POST'],
          allowHeaders: ['content-type'],
          exposeHeaders: ['x-request-id'],
          maxAge: 600,
        }),
        validate.body,
        http.controller,
      ],
    },
  }),
])
