import { application, module } from '@loutrejs/loutre'
import { heartbeat } from './worker/heartbeat.js'

const WorkerModule = module({
  executions: [heartbeat],
})

export default application({ modules: [WorkerModule] })
