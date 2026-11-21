import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { DrizzleDatabase } from './database/drizzle.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = module({
  name: 'DatabaseDrizzlePostgresExample',
  environment: [AppEnv],
  providers: [DrizzleDatabase, UserRepository],
  executions: [UsersController],
})

export default application({ modules: [AppModule] })
