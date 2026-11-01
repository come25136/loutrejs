import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { HealthHttp } from './health.js'
import { AppEnv } from './config/env.js'
import { ProfileBearerGraphQL, ProfileApiKeyGraphQL } from './endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [HealthHttp, ProfileBearerGraphQL, ProfileApiKeyGraphQL],
})

export default defineApplication({ modules: [AuthModule] })
