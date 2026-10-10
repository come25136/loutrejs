// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 5dc16b678e7d8852024f3b58fe70385f66aff97681cdce56e7c4b1d8ec0f30d3
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
