import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { HealthHttp } from './http/endpoint.js'
import { AppEnv } from './config/env.js'
import { ProfileGraphQL } from './graphql/endpoint.js'
import { LoggingModule } from './logging/logger.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [HealthHttp, ProfileGraphQL],
})

export default defineApplication({ modules: [LoggingModule, AuthModule] })
