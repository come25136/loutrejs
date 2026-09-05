import { http } from '@loutrejs/http'
import { AppContract } from './contract.js'

export const AppController = http.implementation({
  name: 'AppController',
  contract: AppContract,
  factory: () => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: { message: `Hello, ${ctx.params.name}!` },
      })
    },
  }),
})
