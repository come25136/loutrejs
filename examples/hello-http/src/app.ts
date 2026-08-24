import { contract, defineModule, implement, procedure } from '@loutrefw/core'
import {
  type ContextOf,
  type ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrefw/http'
import { z } from 'zod'

const GreetingParams = z.object({
  name: z.string().min(1),
})

const Greeting = z.object({
  message: z.string(),
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
        pipeline: [validate.params, http.controller],
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
  constructor(readonly greetings: GreetingService) {}

  async greet(ctx: ContextOf<GreetingHttp, 'greet'>) {
    return ctx.response.ok({
      body: this.greetings.greet(ctx.params.name),
    })
  }
}

const GreetingModule = defineModule(() => ({
  description: '挨拶HTTP APIのサンプル',
  providers: [GreetingService],
  implementations: [
    implement(GreetingContract).for(http).with(GreetingController),
  ],
}))

export default createHttpApplication({
  modules: [GreetingModule()],
})
