import { defineApplication } from '@loutrejs/loutre'
import {
  contextKey,
  contract,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { basicAuth, http } from '@loutrejs/loutre/http'
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
  description: 'Example profile API protected by Basic authentication',
  implementations: [ProfileController],
}))
export default defineApplication({
  modules: [ProfileModule()],
})
