// @generated loutre graphql generateの出力です。直接編集しないでください。
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = <Context extends object>() =>
  createSchemaData<SchemaFields<Context>>({
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
