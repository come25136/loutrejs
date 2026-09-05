import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { PostgresDatabase } from './database/postgres.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = defineModule(() => ({
  name: 'DatabasePostgresExample',
  environment: [AppEnv],
  providers: [PostgresDatabase, UserRepository],
  executions: [UsersController],
}))

export default defineApplication({ modules: [AppModule()] })
