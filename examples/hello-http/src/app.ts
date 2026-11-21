import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { AppController } from './hello/controller.js'

const AppModule = module({
  environment: [AppEnv],
  executions: [AppController],
})

export default application({
  modules: [AppModule],
})
