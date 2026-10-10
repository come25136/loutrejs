// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: ec21de3ef8c94c1ebc2ef45a5a0f20a9f959c83d377081109ac89fcebce60e9a
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = () =>
  createSchemaData<SchemaFields>({
    Counter: {
      step: 'Counter.step',
      value: 'Counter.value',
    },
    Mutation: {
      increment: 'Mutation.increment',
      reset: 'Mutation.reset',
    },
    Query: {
      activeSubscriptions: 'Query.activeSubscriptions',
      counter: 'Query.counter',
      stepBatchCount: 'Query.stepBatchCount',
    },
    Step: {
      amount: 'Step.amount',
      id: 'Step.id',
    },
    Subscription: {
      counterChanged: 'Subscription.counterChanged',
    },
  })
