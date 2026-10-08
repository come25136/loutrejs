import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { CounterStore } from './counter.js'
import { CounterEndpoint } from './endpoint.js'

const CounterModule = defineModule(() => ({
  name: 'GraphQLCounterExample',
  environment: [AppEnv],
  providers: [CounterStore],
  executions: [CounterEndpoint],
}))

export default defineApplication({ modules: [CounterModule()] })
