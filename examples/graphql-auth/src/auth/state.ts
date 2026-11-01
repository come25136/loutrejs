import type { User } from './users.js'

export interface AuthState {
  readonly currentUser: Pick<User, 'id'>
}
