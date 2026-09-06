import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'
import { UsersContract } from './contract.js'
import { UserRepository } from './repository.js'

export const UsersController = http.implementation({
  name: 'UsersController',
  contract: UsersContract,
  factory: (users = inject(UserRepository)) => ({
    create(ctx) {
      return ctx.response.created({
        body: users.create(
          ctx.state.transaction,
          ctx.body.name,
          ctx.state.currentUser.id,
        ),
      })
    },
  }),
})
