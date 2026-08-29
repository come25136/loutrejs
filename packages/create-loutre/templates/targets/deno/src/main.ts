import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import application from './app.ts'

const hostname = '127.0.0.1'
await denoRuntime.serve({ application, hostname })
