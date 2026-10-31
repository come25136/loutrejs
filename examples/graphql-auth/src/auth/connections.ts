import { inject } from '@loutrejs/loutre'
import { Users, type User } from './users.js'

export class Connections {
  readonly #users = new WeakMap<Request, string>()

  constructor(readonly users = inject(Users)) {}

  connect(
    request: Request,
    params: Readonly<Record<string, unknown>> | undefined,
    signal: AbortSignal,
  ): boolean {
    const headers = request.headers
    const credentials =
      headers.has('authorization') || headers.has('x-api-key')
        ? {
            authorization: headers.get('authorization'),
            apiKey: headers.get('x-api-key'),
          }
        : (params ?? {})
    const user = this.users.authenticate(credentials)
    if (!user || signal.aborted) return false
    this.#users.set(request, user.id)
    return true
  }

  requireUser(request: Request): User {
    const id = this.#users.get(request)
    if (!id) throw new Error('認証済みの接続がありません。')
    return this.users.get(id)
  }

  disconnect(request: Request): void {
    this.#users.delete(request)
  }
}
