import { cors, http } from '@loutrejs/http'
import { z } from 'zod'

const CreateMessageBody = z.object({
  text: z.string().min(1),
})

const Message = z.object({
  id: z.string(),
  text: z.string(),
})

const corsMiddleware = cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['POST'],
  allowHeaders: ['content-type'],
  exposeHeaders: ['x-request-id'],
  maxAge: 600,
})

export const MessageContract = http.contract({
  preflight: {
    method: 'OPTIONS',
    path: '/messages',
    responses: {
      ok: { status: 204 },
    },
    middlewares: [corsMiddleware],
  },
  create: {
    method: 'POST',
    path: '/messages',
    request: {
      headers: z.object({ 'content-type': z.literal('application/json') }),
      body: CreateMessageBody,
    },
    responses: {
      created: {
        status: 201,
        body: Message,
        headers: {
          'x-request-id': 'cors-example',
        },
      },
    },
    middlewares: [corsMiddleware],
  },
})
