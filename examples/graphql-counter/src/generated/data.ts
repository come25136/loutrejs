// @generated loutre graphql generateの出力です。直接編集しないでください。
// fingerprint: 664162c93234a7bcc06c565920ca14d9fe9f4b7c3e89990bba965594316b6a3c
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
