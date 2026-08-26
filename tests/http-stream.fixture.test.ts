import { createLinkedEventsApplication } from './helpers/linked-applications.js'
import { reserveHttpPort } from './helpers/http-server.js'

describe('canonical Fixture D HTTP server-stream', () => {
  it('各itemをschema validationしてSSEとして逐次serializeする', async () => {
    const application = createLinkedEventsApplication()
    const port = await reserveHttpPort()
    await application.listen({ port, hostname: '127.0.0.1' })

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
      await application.close()
    }
  })
})
