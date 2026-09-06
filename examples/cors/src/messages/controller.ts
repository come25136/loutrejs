import { http } from '@loutrejs/http'
import { MessageContract } from './contract.js'

export const MessageController = http.implementation({
  name: 'MessageController',
  contract: MessageContract,
  factory: () => ({
    create(ctx) {
      return ctx.response.created({
        body: {
          id: crypto.randomUUID(),
          text: ctx.input.body.text,
        },
      })
    },
  }),
})
