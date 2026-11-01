import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { AppEnv } from './config/env.js'

const app = await nodeRuntime.create({ application })
const { port } = app.get(AppEnv)
await app.serve({ port, hostname: '127.0.0.1' })
console.log(`HTTP接続先: http://127.0.0.1:${port}/graphql`)
console.log(`WS接続先: ws://127.0.0.1:${port}/graphql`)
