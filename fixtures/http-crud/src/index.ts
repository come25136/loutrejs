import { contract, defineModule, implement, procedure } from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrefw/http'
import { z } from 'zod'

export const UserParams = z.object({
  id: z.string(),
})

export const User = z.object({
  id: z.string(),
  name: z.string(),
})

export const CreateUser = z.object({
  name: z.string(),
})

export const UsersContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{id}',
        input: {
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
        input: {
          body: CreateUser,
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
})

export type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

export class UsersService {
  create(name: string) {
    return { id: 'created-user', name }
  }
}

export class UsersController implements UsersHttp {
  constructor(readonly users: UsersService) {}

  async get(ctx: ContextOf<UsersHttp, 'get'>) {
    return ctx.response.found({
      body: {
        id: ctx.params.id,
        name: 'test',
      },
    })
  }

  async create(ctx: ContextOf<UsersHttp, 'create'>) {
    return ctx.response.created({
      body: this.users.create(ctx.body.name),
    })
  }
}

export const UsersModule = defineModule(() => ({
  description: 'Canonical HTTP CRUD fixture',
  providers: [UsersService],
  implementations: [
    implement(UsersContract).for(http).with(UsersController),
  ],
}))

export function createUsersApplication() {
  return createHttpApplication({
    modules: [UsersModule()],
  })
}
