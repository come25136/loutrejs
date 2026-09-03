import { defineLayer, inject } from '@loutrejs/loutre'
import {
  DrizzleDatabase,
  type DrizzleTransaction,
} from '../database/drizzle.js'

export const transaction = defineLayer({
  name: 'database.transaction',
}).factory<{ transaction: DrizzleTransaction }>(
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
)
