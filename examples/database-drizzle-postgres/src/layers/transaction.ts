import { contextKey, inject, layer } from '@loutrejs/loutre'
import {
  DrizzleDatabase,
  type DrizzleTransaction,
} from '../database/drizzle.js'

export const TRANSACTION = contextKey('transaction').of<DrizzleTransaction>()

export const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(DrizzleDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: 'read committed',
          accessMode: 'read write',
          deferrable: false,
        },
      )
    },
})
