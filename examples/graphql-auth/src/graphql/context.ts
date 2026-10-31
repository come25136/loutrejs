import type { Users, User } from '../auth/users.js'

export interface AppContext {
  readonly currentUser: User
  readonly users: Users
  readonly signal: AbortSignal
}
