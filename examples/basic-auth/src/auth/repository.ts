import type { BasicAuthCredentials } from '@loutrejs/loutre/http'
import type { User } from './user.js'

export class UserRepository {
  authenticate(credentials: BasicAuthCredentials): User | undefined {
    if (credentials.username !== 'loutre' || credentials.password !== 'otter') {
      return undefined
    }
    return {
      id: 'user-1',
      name: 'Loutre User',
    }
  }
}
