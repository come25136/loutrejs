// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 1019ddbefd93081317c0b508666094f140fcd3191c5394dcabbda6e414e0bdd2
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
