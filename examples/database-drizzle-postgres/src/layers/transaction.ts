import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from '@loutrejs/http'
import {
  DrizzleDatabase,
  type DrizzleTransaction,
} from '../database/drizzle.js'

export const transaction = defineLayer<
  HttpMiddlewareContext,
  { readonly transaction: DrizzleTransaction },
  HttpExecutionResult,
  readonly [typeof DrizzleDatabase]
>({
  name: 'database.transaction',
  inject: [DrizzleDatabase],
  factory: (database) => async (_context, next) =>
    database.transaction((client) => next({ transaction: client }), {
      isolationLevel: 'read committed',
      accessMode: 'read write',
      deferrable: false,
    }),
})
