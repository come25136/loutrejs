import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import application from './app.js'

const hostname = '127.0.0.1'
await bunRuntime.serve({ application, hostname })
