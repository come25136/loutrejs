import type { GraphQLStateInput } from '@loutrejs/graphql'
import type { Users, User } from './users.js'

export interface AuthState {
  readonly currentUser: Pick<User, 'id'>
}

export function authenticate(
  users: Users,
  { request, connectionParams, signal }: GraphQLStateInput,
): AuthState | Response {
  signal.throwIfAborted()
  const headers = request.headers
  const credentials =
    headers.has('authorization') || headers.has('x-api-key')
      ? {
          authorization: headers.get('authorization'),
          apiKey: headers.get('x-api-key'),
        }
      : (connectionParams ?? {})
  const currentUser = users.authenticate(credentials)
  return currentUser
    ? { currentUser: { id: currentUser.id } }
    : Response.json({ error: '認証が必要です。' }, { status: 401 })
}
