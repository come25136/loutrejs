import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  inject,
  layer,
  procedure,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

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

const GreetingContract = contract({
  greet: procedure({
    protocols: {
      http: http({
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
      }),
    },
  }),
})

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
  name: 'GreetingModule',
  description: 'Example greeting HTTP API',
  providers: [GreetingService, RequestTiming],
  implementations: [GreetingController],
}))

export default defineApplication({
  modules: [GreetingModule()],
})
