import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { AppEnv } from './config/env.js'

const app = await nodeRuntime.create({ application })

await app.serve({ port: app.get(AppEnv).port })
