import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = http.implementation({
  name: 'AppController',
  contract: AppContract,
  factory: () => ({
    async hello(ctx) {
      return ctx.response.ok({
        body: { message: 'Hello from Loutre!' },
      })
    },
  }),
})
