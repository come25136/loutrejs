import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
const app = await nodeRuntime.create({ application })
await app.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: '127.0.0.1',
})
