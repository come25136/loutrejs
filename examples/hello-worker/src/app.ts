import { defineApplication, defineModule } from '@loutrejs/loutre'
import { heartbeat } from './worker/heartbeat.js'

const WorkerModule = defineModule(() => ({
  executions: [heartbeat],
}))

export default defineApplication({ modules: [WorkerModule()] })
