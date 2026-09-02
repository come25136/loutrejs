import { contextKey, inject } from '@loutrejs/loutre'
import { bearerAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'
import { UserRepository } from '../auth/repository.js'

export const CURRENT_USER = contextKey('currentUser').of<User>()

export const bearerAuthentication = bearerAuth({
  name: 'bearerAuthentication',
  realm: 'Loutre Example',
  provides: [CURRENT_USER],
  factory:
    (users = inject(UserRepository)) =>
    (token) =>
      users.authenticate(token),
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Bearer token required' },
  },
})
