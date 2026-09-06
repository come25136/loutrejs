import { defineLayer, inject } from '@loutrejs/loutre'
import {
  DrizzleDatabase,
  type DrizzleTransaction,
} from '../database/drizzle.js'

export const transaction = defineLayer<{
  readonly transaction: DrizzleTransaction
}>({
  name: 'database.transaction',
  factory:
    (database = inject(DrizzleDatabase)) =>
    async (_context, next) =>
      database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: 'read committed',
          accessMode: 'read write',
          deferrable: false,
        },
      ),
})
