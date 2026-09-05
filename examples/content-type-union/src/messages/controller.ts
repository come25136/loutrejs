import { implementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { MessagesContract } from './contract.js'

export const MessagesController = implementation({
  name: 'MessagesController',
  contract: MessagesContract,
  protocol: http,
  factory: () => ({
    async create(ctx) {
      const headers = ctx.input.headers
      const message =
        typeof ctx.input.body === 'string'
          ? ctx.input.body
          : ctx.input.body.message

      if (headers['content-type'] === 'text/plain') {
        return ctx.response.ok({
          body: {
            mediaType: headers['content-type'],
            message,
            customHeader: headers['x-custom-header'],
          },
        })
      }

      return ctx.response.ok({
        body: {
          mediaType: headers['content-type'],
          message,
          customHeader: null,
        },
      })
    },
  }),
})
