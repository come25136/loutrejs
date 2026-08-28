import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import application from './app.ts'

await denoRuntime.serve({
  application,
  hostname: '127.0.0.1',
  port: 3000,
})

console.log('Loutre is swimming at http://127.0.0.1:3000')
