import { contextField, inject } from '@loutrejs/loutre'
import { basicAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'
import { UserRepository } from '../auth/repository.js'

export const CURRENT_USER = contextField<{ currentUser: User }>()

export const basicAuthentication = basicAuth({
  name: 'basicAuthentication',
  realm: 'Loutre Example',
  provide: CURRENT_USER,
  factory:
    (users = inject(UserRepository)) =>
    (credentials) => {
      const currentUser = users.authenticate(credentials)
      return currentUser === undefined ? undefined : { currentUser }
    },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Basic authentication required' },
  },
})
