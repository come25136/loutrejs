import {
  inject,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/loutre'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { AppEnv } from '../config/env.js'
import * as schema from './schema.js'

export type DrizzleDatabaseClient = NodePgDatabase<typeof schema>

export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabaseClient['transaction']>[0]
>[0]

type DrizzleTransactionOptions = Parameters<
  DrizzleDatabaseClient['transaction']
>[1]

export class DrizzleDatabase implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool
  readonly client: DrizzleDatabaseClient

  constructor(readonly env = inject(AppEnv)) {
    this.pool = new Pool({
      connectionString: env.databaseUrl.href,
    })
    this.client = drizzle({ client: this.pool, schema })
  }

  async onModuleInit(): Promise<void> {
    await this.client.execute(sql`select 1`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  transaction<TResult>(
    run: (transaction: DrizzleTransaction) => Promise<TResult>,
    options?: DrizzleTransactionOptions,
  ): Promise<TResult> {
    return this.client.transaction(run, options)
  }
}
