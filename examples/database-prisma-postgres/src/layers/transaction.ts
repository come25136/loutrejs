import { defineLayer, inject } from '@loutrejs/loutre'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaDatabase, type PrismaTransaction } from '../database/prisma.js'

export const transaction = defineLayer({
  name: 'database.transaction',
}).factory<{ transaction: PrismaTransaction }>(
  (database = inject(PrismaDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      )
    },
)
