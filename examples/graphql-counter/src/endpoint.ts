import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { CounterStore } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { typeDefs } from './generated/server.js'
import type { AppContext } from './graphql/context.js'
import { createLoaders } from './graphql/loaders.js'
import { resolvers } from './graphql/resolvers.js'

const schema = makeExecutableSchema({ typeDefs, resolvers })
export const CounterEndpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  schema,
  transports: { http: true, websocket: true },
  factory: (counter = inject(CounterStore), steps = inject(StepService)) => ({
    context: (input): AppContext => ({
      counter,
      steps,
      signal: input.signal,
      loaders: createLoaders(steps, input.signal),
    }),
  }),
})
