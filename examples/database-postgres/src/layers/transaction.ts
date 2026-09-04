import { type, layer, inject } from '@loutrejs/loutre'
import type { PoolClient } from 'pg'
import { PostgresDatabase } from '../database/postgres.js'

export const transaction = layer({
  name: 'database.transaction',
  state: type<{ transaction: PoolClient }>(),
  factory:
    (database = inject(PostgresDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
})
