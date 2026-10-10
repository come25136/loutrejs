// @generated loutre graphql generateの出力です。直接編集しないでください。
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = <Context extends object>() =>
  createSchemaData<SchemaFields<Context>>({
    Mutation: {
      update: 'Mutation.update',
    },
    Query: {
      at: 'Query.at',
      cleanupCount: 'Query.cleanupCount',
      hello: 'Query.hello',
      nullableTicks: 'Query.nullableTicks',
    },
    Subscription: {
      ticks: 'Subscription.ticks',
    },
    Tick: {
      hidden: 'Tick.hidden',
      sequence: 'Tick.sequence',
    },
  })
