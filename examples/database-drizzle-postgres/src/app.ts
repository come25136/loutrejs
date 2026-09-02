import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { DrizzleDatabase } from './database/drizzle.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = defineModule(() => ({
  name: 'DatabaseDrizzlePostgresExample',
  environment: [AppEnv],
  providers: [DrizzleDatabase, UserRepository],
  implementations: [UsersController],
}))

export default defineApplication({ modules: [AppModule()] })
