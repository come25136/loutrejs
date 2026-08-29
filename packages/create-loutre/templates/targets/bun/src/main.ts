import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import application from './app.js'

await bunRuntime.serve({ application })
