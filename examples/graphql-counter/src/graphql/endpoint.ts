import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'
import {
  CounterStore,
  CounterRangeError,
  type CounterChanged,
} from '../domain/counter.js'
import { StepService } from '../domain/step.js'
import { ApiContract } from '../http/contract.js'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'

export interface AppContext {
  readonly counter: CounterStore
  readonly steps: StepService
  readonly signal: AbortSignal
}

export const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers: {
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
            if (!step) throw new Error('Step not found.')
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
  },
})

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
