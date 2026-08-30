import { defineApplication } from '@loutrejs/loutre'
import {
  contextKey,
  contract,
  defineEnv,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { bearerAuth } from './bearer-auth.js'
const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  })
  .transform((env) => ({ port: env.PORT }))

export class AppEnv extends defineEnv(AppEnvSchema) {}

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
    body: { error: 'Bearer token required' },
  },
})
const BearerProfileContract = contract([
  http({
    get: {
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
    },
  }),
])
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
  environment: [AppEnv],
  description: 'Example profile API protected by custom Bearer authentication',
  implementations: [BearerProfileController],
}))
export default defineApplication({
  modules: [BearerProfileModule()],
})
