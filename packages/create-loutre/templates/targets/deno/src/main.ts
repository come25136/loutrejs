import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import application from './app.ts'

const app = await denoRuntime.create({ application })
await app.serve()
