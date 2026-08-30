import { nodeRuntime } from '@loutrejs/node'
import { createUsersApplication } from '../examples/http-crud/src/index.js'
import { reserveHttpPort } from './helpers/http-server.js'

describe('HTTP CRUD example', () => {
  it('runs Contract -> HTTP -> Pipeline -> validation -> Controller -> finalization', async () => {
    const definition = createUsersApplication()
    const port = await reserveHttpPort()
    const host = await nodeRuntime.serve({
      application: definition,
      port,
      hostname: '127.0.0.1',
    })

    try {
      const response = await fetch(`http://127.0.0.1:${port}/users/user-1`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      )
      expect(await response.json()).toEqual({ id: 'user-1', name: 'test' })
      expect(host.application.graph.capabilities).toContainEqual({
        name: 'http.server',
        scope: 'execution',
        requiredBy: 'contract:1.get',
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

      const unsupported = await fetch(`http://127.0.0.1:${port}/users`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ name: 'created' }),
      })
      expect(unsupported.status).toBe(415)
      expect(await unsupported.json()).toEqual({
        error: 'Unsupported Media Type',
      })
    } finally {
      await host.close()
    }
  })
})
