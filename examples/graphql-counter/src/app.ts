import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { CounterStore } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { CounterEndpoint } from './endpoint.js'

const CounterModule = defineModule(() => ({
  name: 'GraphQLCounterExample',
  environment: [AppEnv],
  providers: [CounterStore, StepService],
  executions: [CounterEndpoint],
}))

export default defineApplication({ modules: [CounterModule()] })
