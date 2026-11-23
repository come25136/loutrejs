import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { endpoint, port } from './config.js'

const app = await nodeRuntime.create({ application })
await app.serve({ hostname: endpoint.hostname, port })
