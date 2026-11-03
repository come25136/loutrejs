import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'
import { CounterStore, CounterRangeError } from '../domain/counter.js'
import { StepService } from '../domain/step.js'
import { ApiContract } from '../http/contract.js'
import { manifest } from './manifest.js'
import type { AppContext } from './context.js'

export const CounterEndpoint = graphql.implementation({
  name: 'Counter',
  route: ApiContract.routes.graphql,
  manifest,
  transports: { http: true, websocket: true },
  factory: (
    counter = inject(CounterStore),
    steps = inject(StepService),
    logger = inject(Logger),
  ) => ({
    formatError(error, input) {
      if (error.originalError instanceof CounterRangeError)
        return {
          message: error.originalError.message,
          extensions: { code: 'BAD_USER_INPUT' },
        }
      if (!error.originalError) return error.toJSON()
      logger.error('GraphQL operation failed', {
        transport: input.transport,
        error: error.originalError,
      })
      return { message: 'Internal server error' }
    },
    context: (input): AppContext => ({
      counter,
      steps,
      signal: input.signal,
    }),
  }),
})
