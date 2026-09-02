import type { User } from './user.js'

export class UserRepository {
  authenticate(token: string): User | undefined {
    if (token !== 'loutre-token') return undefined
    return {
      id: 'user-1',
      name: 'Loutre User',
    }
  }
}
