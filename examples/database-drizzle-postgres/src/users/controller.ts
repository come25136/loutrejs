import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'
import { UsersContract } from './contract.js'
import { UserRepository } from './repository.js'

export const UsersController = http.implementation({
  name: 'UsersController',
  contract: UsersContract,
  factory: (users = inject(UserRepository)) => ({
    async create(ctx) {
      return ctx.response.created({
        body: await users.create(ctx.state.transaction, ctx.input.body.name),
      })
    },
  }),
})
