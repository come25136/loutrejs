import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  inject,
  procedure,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const UserParams = {
  id: z.string(),
} as const

export const User = z.object({
  id: z.string(),
  name: z.string(),
})

export const CreateUser = z.object({
  name: z.string(),
})

export const UsersContract = contract(
  {
    get: procedure({
      protocols: {
        http: http({
          method: 'GET',
          path: '/users/{id}',
          request: {
            params: UserParams,
          },
          responses: {
            found: {
              status: 200,
              body: User,
            },
          },
          pipeline: [validate.params, http.controller],
        }),
      },
    }),
    create: procedure({
      protocols: {
        http: http({
          method: 'POST',
          path: '/users',
          request: {
            body: {
              contentType: 'application/json',
              schema: CreateUser,
            },
          },
          responses: {
            created: {
              status: 201,
              body: User,
            },
          },
          pipeline: [validate.body, http.controller],
        }),
      },
    }),
  },
  { name: 'UsersContract' },
)

export class UsersService {
  create(name: string) {
    return { id: 'created-user', name }
  }
}

export const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: { id: ctx.params.id, name: 'test' },
      })
    },
    async create(ctx) {
      return ctx.response.created({
        body: users.create(ctx.body.name),
      })
    },
  }),
})

export const UsersModule = defineModule(() => ({
  name: 'UsersModule',
  description: 'Canonical HTTP CRUD fixture',
  providers: [UsersService],
  implementations: [UsersController],
}))

export function createUsersApplication() {
  return defineApplication({
    modules: [UsersModule()],
  })
}
