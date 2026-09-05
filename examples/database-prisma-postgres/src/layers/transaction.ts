import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaDatabase, type PrismaTransaction } from '../database/prisma.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: PrismaTransaction },
  HttpExecutionResult,
  readonly [typeof PrismaDatabase]
>({
  name: 'database.transaction',
  inject: [PrismaDatabase],
  factory: (database) => async (_context, next) =>
    database.transaction((client) => next({ transaction: client }), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    }),
})
