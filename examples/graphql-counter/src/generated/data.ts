// @generated loutre graphql generateの出力です。直接編集しないでください。
// 入力指紋: afedce8c88d098bf929f905c1cde61aa5d8a5575d70deba73c161afc82969154
import { createSchemaData } from '@loutrejs/graphql/data'
import type { SchemaFields } from './types.js'
export const createData = () =>
  createSchemaData<SchemaFields>(
    {
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
    },
    'afedce8c88d098bf929f905c1cde61aa5d8a5575d70deba73c161afc82969154',
  )
