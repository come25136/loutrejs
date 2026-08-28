import { lambdaRuntime } from '@loutrejs/loutre/runtime/lambda'
import application from './app.js'

export const handler = lambdaRuntime.bind({ application })
