import { http } from '@loutrejs/http'
import { MessageContract } from './contract.js'

export const MessageController = http.implementation({
  name: 'MessageController',
  contract: MessageContract,
  factory: () => ({
    preflight(ctx) {
      return ctx.response.ok({})
    },
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
