import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const CreateMessageBody = z.object({
  text: z.string().min(1),
})

const Message = z.object({
  id: z.string(),
  text: z.string(),
})

const MessageContract = contract({
  create: procedure({
    protocols: {
      http: http({
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
      }),
    },
  }),
})

const MessageController = implementation({
  name: 'MessageController',
  contract: MessageContract,
  protocol: http,
  factory: () => ({
    create(ctx) {
      return ctx.response.created({
        body: {
          id: crypto.randomUUID(),
          text: ctx.body.text,
        },
      })
    },
  }),
})

const MessageModule = defineModule(() => ({
  name: 'MessageModule',
  description: 'CORSを有効にしたHTTP APIのサンプル',
  implementations: [MessageController],
}))

export default defineApplication({
  modules: [MessageModule()],
})
