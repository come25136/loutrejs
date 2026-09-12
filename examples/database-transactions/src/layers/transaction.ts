import { defineLayer, inject } from '@loutrejs/loutre'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const transaction = defineLayer<{
  readonly transaction: InMemoryClient
}>({
  name: 'database.transaction',
  factory:
    (database = inject(DATABASE)) =>
    async (_context, next) =>
      database.transaction(async (client) => {
        await next({ transaction: client })
      }),
})
