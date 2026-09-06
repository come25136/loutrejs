import { defineLayer, inject } from '@loutrejs/loutre'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaDatabase, type PrismaTransaction } from '../database/prisma.js'

export const transaction = defineLayer<{
  readonly transaction: PrismaTransaction
}>({
  name: 'database.transaction',
  factory:
    (database = inject(PrismaDatabase)) =>
    async (_context, next) =>
      database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      ),
})
