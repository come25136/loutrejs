import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { HealthHttp } from './health.js'
import { AppEnv } from './config/env.js'
import { ProfileGraphQL } from './endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [HealthHttp, ProfileGraphQL],
})

export default defineApplication({ modules: [AuthModule] })
