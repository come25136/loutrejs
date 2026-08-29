import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import application from './app.js'

await bunRuntime.serve({
  application,
  hostname: '127.0.0.1',
  port: 3000,
})

console.log('Loutre is swimming at http://127.0.0.1:3000')
