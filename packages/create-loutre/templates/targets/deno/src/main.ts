import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import {
  renderStartupPrelude,
  renderStartupStatus,
} from '@loutrejs/loutre/presentation'
import application from './app.ts'

const hostname = '127.0.0.1'
const port = 3000
const serverUrl = `http://${hostname}:${port}`
const isTTY = Deno.stdout.isTerminal()
const presentation = {
  isTTY,
  color: isTTY && Deno.env.get('NO_COLOR') === undefined,
}
const startup = {
  application: 'Loutre Application',
  version: '{{loutreVersion}}',
  server: serverUrl,
  runtime: `Deno ${Deno.version.deno}`,
  environment:
    Deno.env.get('DENO_ENV') ?? Deno.env.get('NODE_ENV') ?? 'development',
} as const

console.log(renderStartupPrelude(startup, presentation))
const startedAt = performance.now()
await denoRuntime.serve({ application, hostname, port })
console.log(
  renderStartupStatus(
    { ...startup, startupDurationMs: performance.now() - startedAt },
    presentation,
  ),
)
