import { defineLayer, inject } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import type { PoolClient } from 'pg'
import { PostgresDatabase } from '../database/postgres.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: PoolClient },
  HttpExecutionResult
>({
  name: 'database.transaction',
  factory:
    (database = inject(PostgresDatabase)) =>
    async (_context, next) =>
      database.transaction((client) => next({ transaction: client })),
})
