import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'
import { AppEnv } from './config/env.js'
import { CounterStore } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { CounterEndpoint } from './graphql/endpoint.js'

export const logger = new Logger()

const CounterModule = defineModule({
  name: 'GraphQLCounterExample',
  environment: [AppEnv],
  providers: [CounterStore, StepService],
  executions: [CounterEndpoint],
})

export default defineApplication({ modules: [CounterModule], logger })
