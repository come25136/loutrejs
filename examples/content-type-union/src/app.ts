import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { MessagesController } from './messages/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  implementations: [MessagesController],
}))

export default defineApplication({
  modules: [AppModule()],
})
