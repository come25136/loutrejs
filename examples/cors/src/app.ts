import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { MessageController } from './messages/controller.js'

const AppModule = module({
  environment: [AppEnv],
  name: 'MessageModule',
  description: 'Example HTTP API with CORS enabled',
  executions: [MessageController],
})

export default application({
  modules: [AppModule],
})
