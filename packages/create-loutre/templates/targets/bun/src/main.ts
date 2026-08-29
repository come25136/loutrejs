import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import {
  detectPresentationTerminal,
  renderStartupPrelude,
  renderStartupStatus,
} from '@loutrejs/loutre/presentation'
import application from './app.js'

const hostname = '127.0.0.1'
const port = 3000
const serverUrl = `http://${hostname}:${port}`
const presentation = detectPresentationTerminal(process.stdout, process.env)
const startup = {
  application: 'Loutre Application',
  version: '{{loutreVersion}}',
  server: serverUrl,
  runtime: `Bun ${Bun.version}`,
  environment: process.env.NODE_ENV ?? 'development',
} as const

console.log(renderStartupPrelude(startup, presentation))
const startedAt = performance.now()
await bunRuntime.serve({ application, hostname, port })
console.log(
  renderStartupStatus(
    { ...startup, startupDurationMs: performance.now() - startedAt },
    presentation,
  ),
)
