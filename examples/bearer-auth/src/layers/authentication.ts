import { contextField, inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'
import { UserRepository } from '../auth/repository.js'

export const CURRENT_USER = contextField<{ currentUser: User }>()

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  provide: CURRENT_USER,
  factory:
    (users = inject(UserRepository)) =>
    (token) => {
      const currentUser = users.authenticate(token)
      return currentUser === undefined ? undefined : { currentUser }
    },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Bearer token required' },
  },
})
