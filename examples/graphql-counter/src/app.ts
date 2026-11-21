import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { CounterStore } from './domain/counter.js'
import { StepService } from './domain/step.js'
import { CounterEndpoint } from './graphql/endpoint.js'

const CounterModule = module({
  name: 'GraphQLCounterExample',
  environment: [AppEnv],
  providers: [CounterStore, StepService],
  executions: [CounterEndpoint],
})

export default application({ modules: [CounterModule] })
