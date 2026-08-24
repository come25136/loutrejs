import { contextKey, contract, defineModule, implement, procedure } from '@loutrejs/core'
import {
  type ContextOf,
  type ControllerOf,
  basicAuth,
  createHttpApplication,
  http,
} from '@loutrejs/http'
import { z } from 'zod'

const User = z.object({
  id: z.string(),
  name: z.string(),
})

const UnauthorizedBody = z.object({
  error: z.string(),
})

const CURRENT_USER = contextKey('currentUser').of<z.output<typeof User>>()

const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  principal: CURRENT_USER,
  authenticate: (credentials) => {
    if (credentials.username === 'loutre' && credentials.password === 'otter') {
      return {
        id: 'user-1',
        name: 'Loutre User',
      }
    }
    return undefined
  },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Basic認証が必要です' },
  },
})

const ProfileContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/profile',
        responses: {
          ok: {
            status: 200,
            body: User,
          },
          unauthorized: {
            status: 401,
            body: UnauthorizedBody,
            headers: z.object({ 'www-authenticate': z.string() }),
          },
        },
        pipeline: [basicAuthentication, http.controller],
      }),
    },
  }),
})

type ProfileHttp = ControllerOf<typeof ProfileContract, 'http'>

class ProfileController implements ProfileHttp {
  get(ctx: ContextOf<ProfileHttp, 'get'>) {
    return ctx.response.ok({
      body: ctx.currentUser,
    })
  }
}

const ProfileModule = defineModule(() => ({
  description: 'Basic認証で保護したプロフィールAPIのサンプル',
  implementations: [
    implement(ProfileContract).for(http).with(ProfileController),
  ],
}))

export default createHttpApplication({
  modules: [ProfileModule()],
})
