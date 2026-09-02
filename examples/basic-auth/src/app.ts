import {
  contextKey,
  contract,
  defineApplication,
  defineEnv,
  defineModule,
  implementation,
  inject,
} from '@loutrejs/loutre'
import {
  basicAuth,
  http,
  type BasicAuthCredentials,
} from '@loutrejs/loutre/http'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
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
  authenticate(credentials: BasicAuthCredentials): User | undefined {
    if (credentials.username !== 'loutre' || credentials.password !== 'otter') {
      return undefined
    }
    return {
      id: 'user-1',
      name: 'Loutre User',
    }
  }
}

const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  provides: [CURRENT_USER],
  factory:
    (users = inject(UserRepository)) =>
    (credentials) =>
      users.authenticate(credentials),
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Basic authentication required' },
  },
})

const ProfileContract = contract([
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
      pipeline: [basicAuthentication, http.controller],
    },
  }),
])

const ProfileController = implementation({
  name: 'ProfileController',
  contract: ProfileContract,
  protocol: http,
  factory: () => ({
    get(ctx) {
      return ctx.response.ok({ body: ctx.currentUser })
    },
  }),
})

const ProfileModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [UserRepository],
  description: 'Example profile API protected by Basic authentication',
  implementations: [ProfileController],
}))

export default defineApplication({
  modules: [ProfileModule()],
})
