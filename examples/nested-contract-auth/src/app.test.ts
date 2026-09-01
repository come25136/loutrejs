import { bootstrap } from '@loutrejs/loutre/host'
import { afterAll, describe, expect, it } from 'vitest'
import application from './app.js'

const hosted = bootstrap({
  application,
  environment: { PORT: '3003' },
})

afterAll(() => hosted.close())

describe('Nested Contract authentication example', () => {
  it('rejects a request before the child Controller without credentials', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/api/me/profile'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Basic')
  })

  it('passes the user provided by the parent authentication Layer to the child Controller', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/api/me/profile', {
        headers: {
          authorization: `Basic ${btoa('loutre:otter')}`,
        },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'user-1',
      name: 'Loutre User',
    })
  })
})
