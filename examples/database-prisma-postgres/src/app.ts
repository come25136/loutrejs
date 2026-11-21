import { application, module } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { PrismaDatabase } from './database/prisma.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = module({
  name: 'DatabasePrismaPostgresExample',
  environment: [AppEnv],
  providers: [PrismaDatabase, UserRepository],
  executions: [UsersController],
})

export default application({ modules: [AppModule] })
