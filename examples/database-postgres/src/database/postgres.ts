import {
  inject,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/loutre'
import { Pool, type PoolClient } from 'pg'
import { AppEnv } from '../config/env.js'

export class PostgresDatabase implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool

  constructor(readonly env = inject(AppEnv)) {
    this.pool = new Pool({
      connectionString: env.databaseUrl.href,
    })
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1')
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  async transaction<TResult>(
    run: (transaction: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = await this.pool.connect()
    try {
      await transaction.query('BEGIN')
      const result = await run(transaction)
      await transaction.query('COMMIT')
      return result
    } catch (error) {
      await transaction.query('ROLLBACK')
      throw error
    } finally {
      transaction.release()
    }
  }
}
