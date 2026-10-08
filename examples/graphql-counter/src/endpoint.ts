import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { buildSchema } from 'graphql'
import { CounterStore } from './counter.js'

const schema = buildSchema(`
  type Counter { value: Int! }
  type Query {
    counter: Counter!
    activeSubscriptions: Int!
  }
  type Mutation {
    increment(amount: Int! = 1): Counter!
    reset(value: Int! = 0): Counter!
  }
  type Subscription { counterChanged: Counter! }
`)

export const CounterEndpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  schema,
  transports: { http: true, websocket: true },
  factory: (counter = inject(CounterStore)) => ({
    context: (input) => ({ signal: input.signal }),
    rootValue: {
      counter: () => counter.current(),
      activeSubscriptions: () => counter.activeSubscriptions,
      increment: ({ amount }: { amount: number }) => counter.increment(amount),
      reset: ({ value }: { value: number }) => counter.reset(value),
      counterChanged: (_args: unknown, context: { signal: AbortSignal }) =>
        counter.watch(context.signal),
    },
  }),
})
