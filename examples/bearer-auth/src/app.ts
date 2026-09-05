import { defineApplication, defineModule } from '@loutrejs/loutre'
import { UserRepository } from './auth/repository.js'
import { AppEnv } from './config/env.js'
import { BearerProfileController } from './profile/controller.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [UserRepository],
  description: 'Example profile API protected by Bearer authentication',
  executions: [BearerProfileController],
}))

export default defineApplication({
  modules: [AppModule()],
})
