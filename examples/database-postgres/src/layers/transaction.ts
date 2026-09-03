import { defineLayer, inject } from '@loutrejs/loutre'
import type { PoolClient } from 'pg'
import { PostgresDatabase } from '../database/postgres.js'

export const transaction = defineLayer({
  name: 'database.transaction',
}).factory<{ transaction: PoolClient }>(
  (database = inject(PostgresDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
)
