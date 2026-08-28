import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const server = await nodeRuntime.serve({
  application,
  hostname: '127.0.0.1',
  port: 3000,
})

console.log('Loutre is swimming at http://127.0.0.1:3000')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
