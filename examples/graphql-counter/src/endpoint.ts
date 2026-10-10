import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { CounterStore } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { manifest } from './graphql/manifest.js'
import type { AppContext } from './graphql/context.js'

export const CounterEndpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  manifest,
  transports: { http: true, websocket: true },
  factory: (counter = inject(CounterStore), steps = inject(StepService)) => ({
    context: (input): AppContext => ({
      counter,
      steps,
      signal: input.signal,
    }),
  }),
})
