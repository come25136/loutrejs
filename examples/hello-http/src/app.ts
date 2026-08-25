import {
  contract,
  defineModule,
  implement,
  inject,
  layer,
  procedure,
} from '@loutrejs/core'
import {
  type ContextOf,
  type ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

const GreetingParams = z.object({
  name: z.string().min(1),
})

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

type GreetingHttp = ControllerOf<typeof GreetingContract, 'http'>

class GreetingService {
  greet(name: string) {
    return { message: `こんにちは、${name}！` }
  }
}

class GreetingController implements GreetingHttp {
  constructor(readonly greetings = inject(GreetingService)) {}

  async greet(ctx: ContextOf<GreetingHttp, 'greet'>) {
    return ctx.response.ok({
      body: this.greetings.greet(ctx.params.name),
    })
  }
}

const GreetingModule = defineModule(() => ({
  name: 'GreetingModule',
  description: '挨拶HTTP APIのサンプル',
  providers: [GreetingService, RequestTiming],
  implementations: [
    implement(GreetingContract).for(http).with(GreetingController),
  ],
}))

export default createHttpApplication({
  modules: [GreetingModule()],
})
