import { defineLayer, inject } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: InMemoryClient },
  HttpExecutionResult
>({
  name: 'database.transaction',
  factory:
    (database = inject(DATABASE)) =>
    async (_context, next) =>
      database.transaction((client) => next({ transaction: client })),
})
