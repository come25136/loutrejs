import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import { DATABASE, type InMemoryClient } from '../database/in-memory.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: InMemoryClient },
  HttpExecutionResult,
  readonly [typeof DATABASE]
>({
  name: 'database.transaction',
  inject: [DATABASE],
  factory: (database) => async (_context, next) =>
    database.transaction((client) => next({ transaction: client })),
})
