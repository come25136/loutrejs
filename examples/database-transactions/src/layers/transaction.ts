import { type, layer, inject } from '@loutrejs/loutre'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const transaction = layer({
  name: 'database.transaction',
  state: type<{ transaction: InMemoryClient }>(),
  factory:
    (database = inject(DATABASE)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
})
