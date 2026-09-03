import { contextKey, inject } from '@loutrejs/loutre'
import { basicAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'
import { UserRepository } from '../auth/repository.js'

export const CURRENT_USER = contextKey<{ currentUser: User }>('currentUser')

export const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  provide: CURRENT_USER,
  factory:
    (users = inject(UserRepository)) =>
    (credentials) =>
      users.authenticate(credentials),
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Basic authentication required' },
  },
})
