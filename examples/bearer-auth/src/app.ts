import {
  contextKey,
  contract,
  defineApplication,
  defineEnv,
  defineModule,
  implementation,
  inject,
} from '@loutrejs/loutre'
import { bearerAuth, http } from '@loutrejs/loutre/http'
import { z } from 'zod'

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

type User = z.output<typeof User>

const UnauthorizedBody = z.object({
  error: z.string(),
})

const CURRENT_USER = contextKey('currentUser').of<User>()

class UserRepository {
  authenticate(token: string): User | undefined {
    if (token !== 'loutre-token') return undefined
    return {
      id: 'user-1',
      name: 'Loutre User',
    }
  }
}

const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  provides: [CURRENT_USER],
  factory:
    (users = inject(UserRepository)) =>
    (token) =>
      users.authenticate(token),
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
    get(ctx) {
      return ctx.response.ok({ body: ctx.currentUser })
    },
  }),
})

const BearerProfileModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [UserRepository],
  description: 'Example profile API protected by Bearer authentication',
  implementations: [BearerProfileController],
}))

export default defineApplication({
  modules: [BearerProfileModule()],
})
