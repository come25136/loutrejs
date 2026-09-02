import type { PoolClient } from 'pg'

export class UserRepository {
  async create(client: PoolClient, name: string) {
    const result = await client.query<{
      readonly id: string
      readonly name: string
      readonly created_by: string
    }>(
      `INSERT INTO users (id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, created_by`,
      [crypto.randomUUID(), name, 'postgres-example'],
    )
    const user = result.rows[0]
    if (!user) throw new Error('Could not load the created user')
    return {
      id: user.id,
      name: user.name,
      createdBy: user.created_by,
    }
  }
}
