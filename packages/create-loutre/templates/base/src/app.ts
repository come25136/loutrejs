import {
  contract,
  defineApplication,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
const HelloContract = contract([
  http({
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
  }),
])
const AppContract = contract([
  http({
    app: {
      routes: HelloContract.http,
    },
  }),
])
const AppController = implementation({
  name: 'AppController',
  contract: AppContract.http.app.hello,
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
