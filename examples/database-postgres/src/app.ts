import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { PostgresDatabase } from './database/postgres.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = module({
  name: 'DatabasePostgresExample',
  environment: [AppEnv],
  providers: [PostgresDatabase, UserRepository],
  executions: [UsersController],
})

export default application({ modules: [AppModule] })
