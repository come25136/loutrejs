import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
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
  runtime: `Bun ${Bun.version}`,
  environment: process.env.NODE_ENV ?? 'development',
} as const

console.log(renderStartupPrelude(startup, presentation))
const startedAt = performance.now()
const server = await bunRuntime.serve({ application, hostname })
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
