import { Logger } from '@loutrejs/loutre/runtime'
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'
import { AppEnv } from './config/env.js'

const app = await nodeRuntime.create({ application })
const logger = app.get(Logger).child({ source: 'Main' })
const { port } = app.get(AppEnv)
const { port: listeningPort } = await app.serve({ port, hostname: '127.0.0.1' })

logger.info('GraphQL endpoints ready', {
  http: `http://127.0.0.1:${listeningPort}/graphql`,
  websocket: `ws://127.0.0.1:${listeningPort}/graphql`,
})
