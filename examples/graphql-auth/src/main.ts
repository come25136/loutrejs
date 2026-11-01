import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { AppEnv } from './config/env.js'

const app = await nodeRuntime.create({ application })
const { port } = app.get(AppEnv)
await app.serve({ port, hostname: '127.0.0.1' })
console.log(`Bearer認証: http://127.0.0.1:${port}/graphql/bearer`)
console.log(`API key認証: http://127.0.0.1:${port}/graphql/api-key`)
