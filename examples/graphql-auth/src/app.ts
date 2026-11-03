import { defineApplication, defineModule } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'
import { Users } from './auth/users.js'
import { HealthHttp } from './http/health.js'
import { AppEnv } from './config/env.js'
import { ProfileGraphQL } from './graphql/endpoint.js'

export const logger = new Logger()

const AuthModule = defineModule({
  name: 'GraphQLAuthExample',
  environment: [AppEnv],
  providers: [Users],
  executions: [HealthHttp, ProfileGraphQL],
})

export default defineApplication({ modules: [AuthModule], logger })
