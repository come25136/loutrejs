import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { MessageController } from './messages/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  name: 'MessageModule',
  description: 'Example HTTP API with CORS enabled',
  executions: [MessageController],
}))

export default defineApplication({
  modules: [AppModule()],
})
