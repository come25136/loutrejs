import { defineLayer, inject } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaDatabase, type PrismaTransaction } from '../database/prisma.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: PrismaTransaction },
  HttpExecutionResult
>({
  name: 'database.transaction',
  factory:
    (database = inject(PrismaDatabase)) =>
    async (_context, next) =>
      database.transaction((client) => next({ transaction: client }), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      }),
})
