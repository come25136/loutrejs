import { application, module } from '@loutrejs/loutre'
import { UserRepository } from './auth/repository.js'
import { AppEnv } from './config/env.js'
import { ProfileController } from './profile/controller.js'

const AppModule = module({
  environment: [AppEnv],
  providers: [UserRepository],
  description: 'Example profile API protected by Basic authentication',
  executions: [ProfileController],
})

export default application({
  modules: [AppModule],
})
