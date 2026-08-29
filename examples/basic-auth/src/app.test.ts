import { bootstrap } from '@loutrejs/loutre/host'
import { afterAll, describe, expect, it } from 'vitest'
import application from './app.js'

const hosted = bootstrap({ application })

afterAll(() => hosted.close())

describe('Basic認証サンプル', () => {
  it('Authorization headerがなければ401を返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      'Basic realm="Loutre Example", charset="UTF-8"',
    )
    await expect(response.json()).resolves.toEqual({
      error: 'Basic authentication required',
    })
  })

  it('資格情報が不正なら401を返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile', {
        headers: { authorization: `Basic ${btoa('loutre:wrong')}` },
      }),
    )

    expect(response.status).toBe(401)
  })

  it('資格情報が正しければプロフィールを返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile', {
        headers: { authorization: `Basic ${btoa('loutre:otter')}` },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'user-1',
      name: 'Loutre User',
    })
  })
})
