import { nodeRuntime } from '@loutrejs/node'
import {
  detectStartupBannerTerminal,
  printStartupBanner,
} from '@loutrejs/loutre/presentation'
import application from './app.js'

const hostname = '127.0.0.1'
const port = 3000
const serverUrl = `http://${hostname}:${port}`
const startedAt = performance.now()
const server = await nodeRuntime.serve({ application, hostname, port })

printStartupBanner(
  {
    application: 'Loutre Application',
    server: serverUrl,
    runtime: `Node.js ${process.versions.node}`,
    environment: process.env.NODE_ENV ?? 'development',
    startupDurationMs: performance.now() - startedAt,
  },
  detectStartupBannerTerminal(process.stdout, process.env),
  (value) => console.log(value),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
