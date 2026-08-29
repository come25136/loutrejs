import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import {
  detectStartupBannerTerminal,
  printStartupBanner,
} from '@loutrejs/loutre/presentation'
import application from './app.js'

const hostname = '127.0.0.1'
const port = 3000
const serverUrl = `http://${hostname}:${port}`
const startedAt = performance.now()
await bunRuntime.serve({ application, hostname, port })

printStartupBanner(
  {
    application: 'Loutre Application',
    server: serverUrl,
    runtime: `Bun ${Bun.version}`,
    environment: process.env.NODE_ENV ?? 'development',
    startupDurationMs: performance.now() - startedAt,
  },
  detectStartupBannerTerminal(process.stdout, process.env),
  (value) => console.log(value),
)
