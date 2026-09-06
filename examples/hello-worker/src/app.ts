import { defineApplication, defineModule } from '@loutrejs/loutre'
import { heartbeat, hello } from './worker/heartbeat.js'

const WorkerModule = defineModule(() => ({
  executions: [hello, heartbeat],
}))

export default defineApplication({ modules: [WorkerModule()] })
