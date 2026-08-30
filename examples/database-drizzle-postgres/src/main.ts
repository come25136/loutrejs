import { nodeRuntime } from '@loutrejs/node'
import application, { AppEnv } from './app.js'

const app = await nodeRuntime.create({ application })

await app.serve({ port: app.get(AppEnv).port })
