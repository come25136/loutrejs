// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: c86c2a17a6ef154ebb41485c38f78004a165ee5eed17a651c3696773a53cc218
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = () =>
  createSchemaData<SchemaFields>({
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
