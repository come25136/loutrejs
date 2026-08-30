import { defineApplication } from '@loutrejs/loutre'
import { nodeRuntime } from '@loutrejs/node'
import { EventsModule } from '../integrations/streaming/src/index.js'
import { reserveHttpPort } from './helpers/http-server.js'
import { silentLogger } from './helpers/silent-logger.js'

describe('HTTP streaming example', () => {
  it('各itemをschema validationしてSSEとして逐次serializeする', async () => {
    const definition = defineApplication({
      modules: [EventsModule()],
      logger: silentLogger,
    })
    const port = await reserveHttpPort()
    const host = await nodeRuntime.serve({
      application: definition,
      port,
      hostname: '127.0.0.1',
    })

    try {
      const response = await fetch(`http://127.0.0.1:${port}/events`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8',
      )
      expect(await response.text()).toBe(
        'data:{"sequence":1,"message":"event-1"}\n\n' +
          'data:{"sequence":2,"message":"event-2"}\n\n' +
          'data:{"sequence":3,"message":"event-3"}\n\n',
      )
    } finally {
      await host.close()
    }
  })
})
