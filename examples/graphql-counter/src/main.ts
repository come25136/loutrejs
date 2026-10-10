import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { AppEnv } from './config/env.js'

const app = await nodeRuntime.create({ application })
const port = app.get(AppEnv).port
await app.serve({ port, hostname: '127.0.0.1' })
console.log(`GraphQL endpoint: http://127.0.0.1:${port}/graphql`)
