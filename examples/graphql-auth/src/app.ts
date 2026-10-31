import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { Profile } from './auth/http.js'
import { AppEnv } from './config/env.js'
import { AuthenticatedGraphQL } from './endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [Profile, AuthenticatedGraphQL],
})

export default defineApplication({ modules: [AuthModule] })
