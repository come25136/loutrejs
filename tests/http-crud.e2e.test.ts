import { createLinkedUsersApplication } from './helpers/linked-applications.js'
import { reserveHttpPort } from './helpers/http-server.js'

describe('canonical Fixture A', () => {
  it('runs Contract -> HTTP -> Pipeline -> validation -> Controller -> finalization', async () => {
    const application = createLinkedUsersApplication()
    const port = await reserveHttpPort()
    await application.listen({ port, hostname: '127.0.0.1' })
    await expect(
      application.listen({ port, hostname: '127.0.0.1' }),
    ).rejects.toThrow('LUTRE_HTTP_ALREADY_LISTENING')

    try {
      const response = await fetch(`http://127.0.0.1:${port}/users/user-1`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      )
      expect(await response.json()).toEqual({ id: 'user-1', name: 'test' })
      expect(application.graph.capabilities).toContainEqual({
        name: 'http.server',
        scope: 'execution',
        requiredBy: 'UsersContract.get',
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
      await application.close()
    }
  })
})
