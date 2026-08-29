import { nodeRuntime } from '@loutrejs/node'
import {
  detectPresentationTerminal,
  renderStartupPrelude,
  renderStartupStatus,
} from '@loutrejs/loutre/presentation'
import application from './app.js'

const hostname = '127.0.0.1'
const defaultServerUrl = `http://${hostname}:3000`
const presentation = detectPresentationTerminal(process.stdout, process.env)
const startup = {
  application: 'Loutre Application',
  version: '{{loutreVersion}}',
  server: defaultServerUrl,
  runtime: `Node.js ${process.versions.node}`,
  environment: process.env.NODE_ENV ?? 'development',
} as const

console.log(renderStartupPrelude(startup, presentation))
const startedAt = performance.now()
const server = await nodeRuntime.serve({ application, hostname })
console.log(
  renderStartupStatus(
    {
      ...startup,
      server: `http://${hostname}:${server.port}`,
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
