import { defineLayer, inject } from '@loutrejs/loutre'
import type { PoolClient } from 'pg'
import { PostgresDatabase } from '../database/postgres.js'

export const transaction = defineLayer<{ readonly transaction: PoolClient }>({
  name: 'database.transaction',
  factory:
    (database = inject(PostgresDatabase)) =>
    async (_context, next) =>
      database.transaction(async (client) => {
        await next({ transaction: client })
      }),
})
