import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Users } from './auth/users.js'
import { ProfileHttp } from './auth/http.js'
import { AppEnv } from './config/env.js'
import { ProfileGraphQL } from './endpoint.js'

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [ProfileHttp, ProfileGraphQL],
})

export default defineApplication({ modules: [AuthModule] })
