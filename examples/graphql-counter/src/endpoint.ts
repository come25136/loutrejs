import { http } from '@loutrejs/loutre/http'
import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { CounterStore, CounterRangeError } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { manifest } from './graphql/manifest.js'
import type { AppContext } from './graphql/context.js'

const ApiContract = http.contract({
  graphql: { raw: true, method: '*', path: '/graphql' },
})

export const CounterEndpoint = graphql.implementation({
  name: 'Counter',
  route: ApiContract.routes.graphql,
  manifest,
  http: true,
  ws: true,
  factory: (counter = inject(CounterStore), steps = inject(StepService)) => ({
    formatError(error, input) {
      if (error.originalError instanceof CounterRangeError)
        return {
          message: error.originalError.message,
          extensions: { code: 'BAD_USER_INPUT' },
        }
      if (!error.originalError) return error.toJSON()
      console.error(`[GraphQL ${input.transport}]`, error.originalError)
      return { message: 'Internal server error' }
    },
    context: (input): AppContext => ({
      counter,
      steps,
      signal: input.signal,
    }),
  }),
})
