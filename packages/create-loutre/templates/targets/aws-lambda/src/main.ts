import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import application from './app.js'

export const handler = awsLambdaRuntime.bind({ application })
