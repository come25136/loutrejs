import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { ProfileController } from './profile/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  description: 'Nested Contract authentication and inherited Context example',
  implementations: [ProfileController],
}))

export default defineApplication({
  modules: [AppModule()],
})
