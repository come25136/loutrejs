import {
  contract,
  contextKey,
  defineModule,
  implement,
  layer,
  procedure,
} from '@loutrejs/core'
import { http } from '@loutrejs/http'
import { z } from 'zod'

const SESSION = contextKey('session').of<string>()

const broken = layer({
  name: 'broken',
  provides: [SESSION],
  inbound: (() => ({ wrong: 'value' })) as any,
})

const BrokenContract = contract({
  run: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/broken',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [broken, http.controller],
      }),
    },
  }),
})

class BrokenController {
  run() {}
}

export const BrokenModule = defineModule(() => ({
  implementations: [
    implement(BrokenContract).for(http).with(BrokenController as any),
  ],
}))
