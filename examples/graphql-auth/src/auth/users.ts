import { EventEmitter, on } from 'node:events'

export interface User {
  readonly id: string
  readonly name: string
}

export interface Credentials {
  readonly authorization?: unknown
  readonly apiKey?: unknown
}

const bearerUsers = new Map([
  ['Bearer momiji-token', 'user-1'],
  ['Bearer kaede-token', 'user-2'],
])
const apiKeyUsers = new Map([
  ['momiji-key', 'user-1'],
  ['kaede-key', 'user-2'],
])

export class Users {
  readonly #users = new Map<string, User>([
    ['user-1', { id: 'user-1', name: 'もみじ' }],
    ['user-2', { id: 'user-2', name: 'かえで' }],
  ])
  readonly #events = new EventEmitter()

  constructor() {
    this.#events.setMaxListeners(0)
  }

  authenticate({ authorization, apiKey }: Credentials): User | undefined {
    const id =
      authorization != null
        ? typeof authorization === 'string'
          ? bearerUsers.get(authorization)
          : undefined
        : typeof apiKey === 'string'
          ? apiKeyUsers.get(apiKey)
          : undefined
    return id === undefined ? undefined : this.#users.get(id)
  }

  get(id: string): User {
    const user = this.#users.get(id)
    if (!user) throw new Error('利用者が見つかりません。')
    return user
  }

  rename(id: string, name: string): User {
    const user = { ...this.get(id), name }
    this.#users.set(id, user)
    this.#events.emit(id, user)
    return user
  }

  async *watch(id: string, signal: AbortSignal): AsyncGenerator<User> {
    const events = on(this.#events, id, { signal })
    try {
      yield this.get(id)
      for await (const [user] of events) yield user as User
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      await events.return?.()
    }
  }
}
