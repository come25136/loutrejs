import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

await nodeRuntime.serve({
  application,
  port: Number(process.env.PORT ?? 3002),
})
