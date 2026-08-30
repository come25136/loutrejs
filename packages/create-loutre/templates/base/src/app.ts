import {
  defineApplication,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
const AppContract = http.contract(
  {
    hello: {
      method: 'GET',
      path: '/',
      responses: {
        ok: {
          status: 200,
          body: z.object({
            message: z.string(),
          }),
        },
      },
      pipeline: [http.controller],
    },
  },
  { name: 'AppContract' },
)
const AppController = implementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
  factory: () => ({
    async hello(ctx) {
      return ctx.response.ok({
        body: { message: 'Hello from Loutre!' },
      })
    },
  }),
})
const AppModule = defineModule(() => ({
  name: 'AppModule',
  description: 'HTTP Application entry module',
  implementations: [AppController],
}))
export default defineApplication({
  modules: [AppModule()],
})
