import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createNodeHttpServer } from '@loutrefw/runtime-node'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

describe('canonical Fixture D HTTP server-stream', () => {
  it('各itemをschema validationしてSSEとして逐次serializeする', async () => {
    const application = createEventsApplication()
    const server = createNodeHttpServer(application)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const { port } = server.address() as AddressInfo
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
      server.close()
      await once(server, 'close')
      await application.shutdown('test')
    }
  })
})
