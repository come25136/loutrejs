import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = http.implementation({
  name: 'AppController',
  contract: AppContract,
  factory: () => ({
    async greet(ctx) {
      return {
        schema: AppContract.greet.ok,
        body: { message: `Hello, ${ctx.input.params.name}!` },
      }
    },
  }),
})
