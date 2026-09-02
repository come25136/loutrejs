import { defineApplication, defineModule, provide } from '@loutrejs/loutre'
import { AppEnv } from './config/env.js'
import { DATABASE, InMemoryDatabase } from './database/in-memory.js'
import { UsersController } from './users/controller.js'
import { UserRepository } from './users/repository.js'

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  name: 'DatabaseTransactionsExample',
  providers: [provide(DATABASE).useClass(InMemoryDatabase), UserRepository],
  implementations: [UsersController],
}))

export default defineApplication({ modules: [AppModule()] })
