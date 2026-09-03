import { defineLayer, inject } from '@loutrejs/loutre'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const transaction = defineLayer({
  name: 'database.transaction',
}).factory<{ transaction: InMemoryClient }>(
  (database = inject(DATABASE)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
)
