import { contextField } from '@loutrejs/loutre'
import { basicAuth } from '@loutrejs/loutre/http'
import type { User } from '../auth/user.js'

export const CURRENT_USER = contextField<{ currentUser: User }>('currentUser')

export const authentication = basicAuth({
  name: 'authentication',
  realm: 'Loutre Nested Contract Example',
  provide: CURRENT_USER,
  factory:
    () =>
    ({ username, password }) => {
      if (username !== 'loutre' || password !== 'otter') return undefined
      return { id: 'user-1', name: 'Loutre User' }
    },
  unauthorized: {
    variant: 'unauthorized',
    body: { error: 'Authentication required' },
  },
})
