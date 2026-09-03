import { contextField, inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'
import { UserRepository } from '../auth/repository.js'

export const CURRENT_USER = contextField<{ currentUser: User }>('currentUser')

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  provide: CURRENT_USER,
  factory:
    (users = inject(UserRepository)) =>
    (token) =>
      users.authenticate(token),
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Bearer token required' },
  },
})
