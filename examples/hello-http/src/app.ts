import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineEnv,
  defineModule,
  implementation,
  inject,
  layer,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'
const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .transform((env) => ({ port: env.PORT }))

export class AppEnv extends defineEnv(AppEnvSchema) {}

const GreetingParams = {
  name: z.string().min(1),
} as const
const Greeting = z.object({
  message: z.string(),
})
class RequestTiming {
  async measure(next: () => Promise<void>): Promise<void> {
    const startedAt = performance.now()
    try {
      await next()
    } finally {
      void (performance.now() - startedAt)
    }
  }
}
const requestTiming = layer({
  name: 'request.timing',
  factory:
    (timing = inject(RequestTiming)) =>
    async (_ctx, next) => {
      await timing.measure(next)
    },
})
const GreetingContract = contract([
  http({
    greet: {
      method: 'GET',
      path: '/greetings/{name}',
      request: {
        params: GreetingParams,
      },
      responses: {
        ok: {
          status: 200,
          body: Greeting,
        },
      },
      pipeline: [requestTiming([validate.params, http.controller])],
    },
  }),
])
class GreetingService {
  greet(name: string) {
    return { message: `Hello, ${name}!` }
  }
}
const GreetingController = implementation({
  name: 'GreetingController',
  contract: GreetingContract,
  protocol: http,
  factory: (greetings = inject(GreetingService)) => ({
    async greet(ctx) {
      return ctx.response.ok({ body: greetings.greet(ctx.params.name) })
    },
  }),
})
const GreetingModule = defineModule(() => ({
  environment: [AppEnv],
  name: 'GreetingModule',
  description: 'Example greeting HTTP API',
  providers: [GreetingService, RequestTiming],
  implementations: [GreetingController],
}))
export default defineApplication({
  modules: [GreetingModule()],
})
