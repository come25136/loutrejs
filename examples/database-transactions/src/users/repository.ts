import type { InMemoryClient } from '../database/in-memory.js'
import type { User } from './user.js'

export class UserRepository {
  create(client: InMemoryClient, name: string, createdBy: string): User {
    const user = { id: crypto.randomUUID(), name, createdBy }
    client.users.set(user.id, user)
    return user
  }
}
