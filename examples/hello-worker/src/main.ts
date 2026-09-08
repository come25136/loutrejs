import { bootstrapApplication } from '@loutrejs/loutre'
import application from './app.js'

const app = await bootstrapApplication({ application })
await app.tasks.start()

let closing = false

const close = async (signal: string) => {
  if (closing) return
  closing = true
  await app.close(signal)
}

process.once('SIGINT', () => void close('SIGINT'))
process.once('SIGTERM', () => void close('SIGTERM'))
