import { createData } from '../generated/data.js'
import type { Resolvers } from '../generated/types.js'
import type { AppContext } from './context.js'
import type { CounterChanged } from '../domain/counter.js'

const d = createData<AppContext>()

export const resolvers = {
  Query: {
    counter: d.Query.counter.source(({ context }) => context.counter.current()),
    activeSubscriptions: (_parent, _args, context) =>
      context.counter.activeSubscriptions,
    stepBatchCount: (_parent, _args, context) => context.steps.batchCount,
  },
  Mutation: {
    increment: (_parent, { amount }, context) =>
      context.counter.increment(amount),
    reset: (_parent, { value }, context) => context.counter.reset(value),
  },
  Counter: {
    step: d.Counter.step.field({
      requires: ['stepId'],
      load: async (counters, { context, signal }) => {
        const values = await context.steps.findByIds(
          counters.map((counter) => counter.stepId),
          signal,
        )
        return values.map((step) => {
          if (!step) throw new Error('stepが見つかりません。')
          return step
        })
      },
    }),
  },
  Subscription: {
    counterChanged: {
      subscribe: (_parent, _args, context) =>
        context.counter.watch(context.signal),
      resolve: (event: CounterChanged) => event.counterChanged,
    },
  },
} satisfies Resolvers<AppContext>
