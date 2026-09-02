import { implementation, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { UserRepository } from './repository.js'
import { UsersContract } from './contract.js'

export const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UserRepository)) => ({
    create(ctx) {
      return ctx.response.created({
        body: users.create(ctx.transaction, ctx.body.name, ctx.currentUser.id),
      })
    },
  }),
})
