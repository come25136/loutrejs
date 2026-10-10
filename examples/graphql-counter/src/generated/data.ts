// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 9998cd77979a3341de177c98c02b25aee37d1e626fd39c88098c24f92b94706b
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
