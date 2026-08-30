import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import application from './app.js'

const app = await bunRuntime.create({ application })
await app.serve()
