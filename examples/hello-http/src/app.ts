import {
  contract,
  defineApplication,
  defineEnv,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .transform((env) => ({ port: env.PORT }))

export class AppEnv extends defineEnv(AppEnvSchema) {}

const AppContract = contract([
  http({
    greet: {
      method: 'GET',
      path: '/{name}',
      request: {
        params: {
          name: z.string().min(2),
        },
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({ message: z.string() }),
        },
      },
      pipeline: [validate.params, http.controller],
    },
  }),
])

const AppController = implementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
  factory: () => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: { message: `Hello, ${ctx.params.name}!` },
      })
    },
  }),
})

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  implementations: [AppController],
}))

export default defineApplication({
  modules: [AppModule()],
})
