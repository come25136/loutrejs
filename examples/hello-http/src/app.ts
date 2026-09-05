import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { AppController } from './hello/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  executions: [AppController],
}))

export default defineApplication({
  modules: [AppModule()],
})
