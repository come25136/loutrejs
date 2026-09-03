import { contextField, inject, layer } from '@loutrejs/loutre'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaDatabase, type PrismaTransaction } from '../database/prisma.js'

export const TRANSACTION = contextField<{ transaction: PrismaTransaction }>()

export const transaction = layer({
  name: 'database.transaction',
  provide: TRANSACTION,
  factory:
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
})
