import { defineApplication } from '@loutrejs/loutre'
import { heartbeat } from './worker/heartbeat.js'

export default defineApplication({
  modules: [],
  triggers: [heartbeat],
})
