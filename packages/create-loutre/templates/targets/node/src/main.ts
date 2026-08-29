import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const hostname = '127.0.0.1'
const server = await nodeRuntime.serve({ application, hostname })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
