import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createNodeHttpServer } from '@loutrefw/runtime-node'

describe('canonical Fixture A', () => {
  it('runs Contract -> HTTP -> Pipeline -> validation -> Controller -> finalization', async () => {
    const application = createUsersApplication()
    const server = createNodeHttpServer(application)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const { port } = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${port}/users/user-1`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      )
      expect(await response.json()).toEqual({ id: 'user-1', name: 'test' })
      expect(application.graph.capabilities).toContainEqual({
        name: 'http.server',
        requiredBy: 'Contract1.get',
      })

      const created = await fetch(`http://127.0.0.1:${port}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'created' }),
      })
      expect(created.status).toBe(201)
      expect(await created.json()).toEqual({
        id: 'created-user',
        name: 'created',
      })
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})
