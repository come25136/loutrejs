import { workerdRuntime } from '@loutrejs/loutre/runtime/workerd'
import application from './app.js'

export default workerdRuntime.bind({ application })
