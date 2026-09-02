import type { DrizzleTransaction } from '../database/drizzle.js'
import * as schema from '../database/schema.js'

export class UserRepository {
  async create(client: DrizzleTransaction, name: string) {
    const [user] = await client
      .insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        name,
        createdBy: 'drizzle-example',
      })
      .returning()
    if (!user) throw new Error('Could not load the created user')
    return user
  }
}
