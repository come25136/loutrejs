import { defineApplication } from '@loutrejs/application'
import {
  contextKey,
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/core'
import { http } from '@loutrejs/http'
import { z } from 'zod'
import { bearerAuth } from './bearer-auth.js'

const User = z.object({
  id: z.string(),
  name: z.string(),
})

const UnauthorizedBody = z.object({
  error: z.string(),
})

const BEARER_CURRENT_USER =
  contextKey('bearerCurrentUser').of<z.output<typeof User>>()

const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  principal: BEARER_CURRENT_USER,
  authenticate: (token) => {
    if (token !== 'loutre-token') return undefined
    return {
      id: 'user-1',
      name: 'Loutre User',
    }
  },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Bearer tokenが必要です' },
  },
})

const BearerProfileContract = contract({
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
        pipeline: [bearerAuthentication, http.controller],
      }),
    },
  }),
})

const BearerProfileController = implementation({
  name: 'BearerProfileController',
  contract: BearerProfileContract,
  protocol: http,
  factory: () => ({
    get(context) {
      return context.response.ok({ body: context.bearerCurrentUser })
    },
  }),
})

const BearerProfileModule = defineModule(() => ({
  description: 'ユーザー定義Bearer認証で保護したプロフィールAPIのサンプル',
  implementations: [BearerProfileController],
}))

export default defineApplication({
  modules: [BearerProfileModule()],
})
