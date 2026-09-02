import { defineApplication, defineModule } from '@loutrejs/loutre'
import { UserRepository } from './auth/repository.js'
import { AppEnv } from './config/env.js'
import { ProfileController } from './profile/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [UserRepository],
  description: 'Example profile API protected by Basic authentication',
  implementations: [ProfileController],
}))

export default defineApplication({
  modules: [AppModule()],
})
