import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const server = await nodeRuntime.serve({ application })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
