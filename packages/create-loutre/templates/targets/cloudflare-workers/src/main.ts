import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import application from './app.js'

export default cloudflareWorkersRuntime.bind({ application })
