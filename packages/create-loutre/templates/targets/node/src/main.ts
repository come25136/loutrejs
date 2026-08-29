import { nodeRuntime } from '@loutrejs/node'
import {
  detectPresentationTerminal,
  renderLoutreBrand,
  renderStartupStatus,
} from '@loutrejs/loutre/presentation'
import application from './app.js'

const hostname = '127.0.0.1'
const port = 3000
const serverUrl = `http://${hostname}:${port}`
const presentation = detectPresentationTerminal(process.stdout, process.env)

console.log(renderLoutreBrand(presentation))
const startedAt = performance.now()
const server = await nodeRuntime.serve({ application, hostname, port })
console.log(
  renderStartupStatus(
    {
      application: 'Loutre Application',
      server: serverUrl,
      runtime: `Node.js ${process.versions.node}`,
      environment: process.env.NODE_ENV ?? 'development',
      startupDurationMs: performance.now() - startedAt,
    },
    presentation,
  ),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close(signal)
  })
}
