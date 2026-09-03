import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { MessageContract } from './contract.js'

export const MessageController = defineImplementation({
  name: 'MessageController',
  contract: MessageContract,
  protocol: http,
}).factory(() => ({
  create(ctx) {
    return ctx.response.created({
      body: {
        id: crypto.randomUUID(),
        text: ctx.input.body.text,
      },
    })
  },
}))
