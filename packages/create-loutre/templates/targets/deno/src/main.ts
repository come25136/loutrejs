import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import {
  renderStartupPrelude,
  renderStartupStatus,
} from '@loutrejs/loutre/presentation'
import application from './app.ts'

const hostname = '127.0.0.1'
const defaultServerUrl = `http://${hostname}:3000`
const isTTY = Deno.stdout.isTerminal()
const presentation = {
  isTTY,
  color: isTTY && Deno.env.get('NO_COLOR') === undefined,
}
const startup = {
  application: 'Loutre Application',
  version: '{{loutreVersion}}',
  server: defaultServerUrl,
  runtime: `Deno ${Deno.version.deno}`,
  environment:
    Deno.env.get('DENO_ENV') ?? Deno.env.get('NODE_ENV') ?? 'development',
} as const

console.log(renderStartupPrelude(startup, presentation))
const startedAt = performance.now()
const server = await denoRuntime.serve({ application, hostname })
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
