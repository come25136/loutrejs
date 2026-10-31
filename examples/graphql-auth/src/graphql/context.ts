import type { AuthState } from '../auth/authentication.js'
import type { Users } from '../auth/users.js'

export interface AppContext extends AuthState {
  readonly users: Users
  readonly signal: AbortSignal
}
