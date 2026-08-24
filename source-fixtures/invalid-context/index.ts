import {
  contract,
  contextKey,
  defineModule,
  implement,
  procedure,
} from '@loutrejs/core'
import { ContextOf, ControllerOf, http } from '@loutrejs/http'
import { z } from 'zod'

const SESSION = contextKey('session').of<{
  readonly userId: string
}>()

const InvalidContextContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/invalid-context',
        responses: {
          ok: { status: 200, body: z.object({ userId: z.string() }) },
        },
        pipeline: [http.controller],
      }),
    },
  }),
})

type InvalidContextHttp = ControllerOf<typeof InvalidContextContract, 'http'>

class InvalidContextController implements InvalidContextHttp {
  get(ctx: ContextOf<InvalidContextHttp, 'get'>) {
    return ctx.response.ok({
      body: { userId: ctx.session.userId },
    })
  }
}

export const InvalidContextModule = defineModule(() => ({
  implementations: [
    implement(InvalidContextContract).for(http).with(InvalidContextController),
  ],
}))
