import { defineApplication, defineModule } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { PrismaDatabase } from './database/prisma.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = defineModule(() => ({
  name: 'DatabasePrismaPostgresExample',
  environment: [AppEnv],
  providers: [PrismaDatabase, UserRepository],
  implementations: [UsersController],
}))

export default defineApplication({ modules: [AppModule()] })
