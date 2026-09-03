import { defineImplementation } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = defineImplementation({
  name: 'AppController',
  contract: AppContract.http.app.hello,
  protocol: http,
}).factory(() => ({
  async hello(ctx) {
    return ctx.response.ok({
      body: { message: 'Hello from Loutre!' },
    })
  },
}))
