import { implementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = implementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
  factory: () => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: { message: `Hello, ${ctx.input.params.name}!` },
      })
    },
  }),
})
