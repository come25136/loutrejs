import { contextKey, inject, layer } from '@loutrejs/loutre'
import type { PoolClient } from 'pg'
import { PostgresDatabase } from '../database/postgres.js'

export const TRANSACTION = contextKey<{ transaction: PoolClient }>(
  'transaction',
)

export const transaction = layer({
  name: 'database.transaction',
  provide: TRANSACTION,
  factory:
    (database = inject(PostgresDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
})
