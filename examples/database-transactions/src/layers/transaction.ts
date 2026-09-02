import { contextKey, inject, layer } from '@loutrejs/loutre'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const TRANSACTION = contextKey('transaction').of<InMemoryClient>()

export const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(DATABASE)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
    },
})
