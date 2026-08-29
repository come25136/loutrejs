import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import application from './app.ts'

await denoRuntime.serve({ application })
