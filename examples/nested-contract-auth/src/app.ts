import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { ProfileController } from './profile/controller.js'

const AppModule = module({
  environment: [AppEnv],
  description: 'Nested Contract authentication and inherited Context example',
  executions: [ProfileController],
})

export default application({
  modules: [AppModule],
})
