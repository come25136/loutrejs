import { createUsersApplication } from '../../dist/fixtures/http-crud/src/index.js'
import { nodeRuntime } from '@loutrejs/node'

const port = Number(process.env.BENCHMARK_PORT ?? 43110)
const handle = await nodeRuntime.serve({
  application: createUsersApplication(),
  hostname: '127.0.0.1',
  port,
  shutdownHooks: false,
})

process.stdout.write(`BENCHMARK_READY http://127.0.0.1:${handle.port}\n`)

let closing = false
async function close(signal) {
  if (closing) return
  closing = true
  try {
    await handle.close(signal)
    process.exitCode = 0
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

process.once('SIGINT', () => void close('SIGINT'))
process.once('SIGTERM', () => void close('SIGTERM'))
