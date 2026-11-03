import { defineApplication, defineModule, LoggerModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { HealthHttp } from './http/endpoint.js'
import { AppEnv } from './config/env.js'
import { ProfileGraphQL } from './graphql/endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [HealthHttp, ProfileGraphQL],
})

export default defineApplication({ modules: [LoggerModule, AuthModule] })
