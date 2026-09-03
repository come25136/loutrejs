import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = defineImplementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
}).factory(() => ({
  async greet(ctx) {
    return ctx.response.ok({
      body: { message: `Hello, ${ctx.input.params.name}!` },
    })
  },
}))
