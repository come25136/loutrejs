import {
  contextKey,
  contract,
  defineApplication,
  defineEnv,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { basicAuth, http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  })
  .transform((env) => ({ port: env.PORT }))

export class AppEnv extends defineEnv(AppEnvSchema) {}

const User = z.object({
  id: z.string(),
  name: z.string(),
})

type User = z.output<typeof User>

const CURRENT_USER = contextKey('currentUser').of<User>()

const authentication = basicAuth({
  name: 'authentication',
  realm: 'Loutre Nested Contract Example',
  provides: [CURRENT_USER],
  factory:
    () =>
    ({ username, password }) => {
      if (username !== 'loutre' || password !== 'otter') return undefined
      return { id: 'user-1', name: 'Loutre User' }
    },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Authentication required' },
  },
})

const ProfileContract = contract([
  http({
    profile: {
      method: 'GET',
      path: '/profile',
      responses: {
        ok: {
          status: 200,
          body: User,
        },
      },
      pipeline: [http.controller],
    },
  }),
])

const AppContract = contract([
  http({
    api: {
      path: '/api',
      pipeline: [authentication],
      responses: {
        unauthorized: {
          status: 401,
          body: z.object({ error: z.string() }),
          headers: z.object({ 'www-authenticate': z.string() }),
        },
      },
      routes: {
        me: {
          path: '/me',
          routes: ProfileContract.http,
        },
      },
    },
  }),
])

const ProfileController = implementation({
  name: 'ProfileController',
  contract: AppContract.http.api.me.profile,
  protocol: http,
  factory: () => ({
    profile(ctx) {
      const currentUser: User = ctx.currentUser
      return ctx.response.ok({ body: currentUser })
    },
  }),
})

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  description: 'Nested Contract authentication and inherited Context example',
  implementations: [ProfileController],
}))

export default defineApplication({
  modules: [AppModule()],
})
