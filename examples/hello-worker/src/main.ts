import { bootstrap } from '@loutrejs/loutre/host'
import application from './app.js'

const app = bootstrap({ application })
await app.triggers.start()

let closing = false

const close = async (signal: string) => {
  if (closing) return
  closing = true
  await app.close(signal)
}

process.once('SIGINT', () => void close('SIGINT'))
process.once('SIGTERM', () => void close('SIGTERM'))
