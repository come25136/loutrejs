import type { Resolvers } from '../generated/types.js'
import type { AppContext } from './context.js'
import type { CounterChanged } from '../domain/counter.js'

export const resolvers = {
  Query: {
    counter: ({ context }) => context.counter.current(),
    activeSubscriptions: ({ context }) => context.counter.activeSubscriptions,
    stepBatchCount: ({ context }) => context.steps.batchCount,
  },
  Mutation: {
    increment: ({ args: { amount }, context }) =>
      context.counter.increment(amount),
    reset: ({ args: { value }, context }) => context.counter.reset(value),
  },
  Counter: {
    step: {
      requires: ['stepId'],
      load: async ({ parents: counters, context, signal }) => {
        const values = await context.steps.findByIds(
          counters.map((counter) => counter.stepId),
          signal,
        )
        return values.map((step) => {
          if (!step) throw new Error('stepが見つかりません。')
          return step
        })
      },
    },
  },
  Subscription: {
    counterChanged: {
      subscribe: ({ context }) => context.counter.watch(context.signal),
      resolve: ({ parent: event }: { parent: CounterChanged }) =>
        event.counterChanged,
    },
  },
} satisfies Resolvers<AppContext>
