import type { Resolvers } from '../generated/server.js'
import type { AppContext } from './context.js'
import type { CounterChanged } from '../domain/counter.js'

export const resolvers = {
  Query: {
    counter: (_parent, _args, context) => context.counter.current(),
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
    step: async (counter, _args, context) => {
      const step = await context.loaders.step.load(counter.stepId)
      if (!step) throw new Error('stepが見つかりません。')
      return step
    },
  },
  Subscription: {
    counterChanged: {
      subscribe: (_parent, _args, context) =>
        context.counter.watch(context.signal),
      resolve: (event: CounterChanged) => event.counterChanged,
    },
  },
} satisfies Resolvers<AppContext>
