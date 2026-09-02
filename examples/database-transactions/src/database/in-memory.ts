import { token } from '@loutrejs/loutre'
import type { User } from '../users/user.js'

export class InMemoryClient {
  constructor(readonly users: Map<string, User>) {}
}

export class InMemoryDatabase {
  readonly client = new InMemoryClient(new Map())

  async transaction<TResult>(
    run: (transaction: InMemoryClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = new InMemoryClient(new Map(this.client.users))
    const result = await run(transaction)
    this.client.users.clear()
    for (const [id, user] of transaction.users) {
      this.client.users.set(id, user)
    }
    return result
  }
}

export const DATABASE = token<InMemoryDatabase>('database.primary')
