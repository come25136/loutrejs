import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { AppEnv } from './config/env.js'
import { ProfileBearerGraphQL, ProfileApiKeyGraphQL } from './endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [ProfileBearerGraphQL, ProfileApiKeyGraphQL],
})

export default defineApplication({ modules: [AuthModule] })
