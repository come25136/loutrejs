import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

await nodeRuntime.serve({ application, port: 3002 })
