import { implementation, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { UserRepository } from './repository.js'
import { UsersContract } from './contract.js'

export const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UserRepository)) => ({
    async create(ctx) {
      return ctx.response.created({
        body: await users.create(ctx.transaction, ctx.body.name),
      })
    },
  }),
})
