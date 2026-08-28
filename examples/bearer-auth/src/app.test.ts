import { bootstrap } from '@loutrejs/loutre/host'
import { afterAll, describe, expect, it } from 'vitest'
import application from './app.js'

const hosted = bootstrap({ application })

afterAll(() => hosted.close())

describe('ユーザー定義Bearer認証サンプル', () => {
  it('Authorization headerがなければ401を返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile'),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      'Bearer realm="Loutre Example"',
    )
    await expect(response.json()).resolves.toEqual({
      error: 'Bearer tokenが必要です',
    })
  })

  it('tokenが不正なら401を返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile', {
        headers: { authorization: 'Bearer wrong-token' },
      }),
    )

    expect(response.status).toBe(401)
  })

  it('tokenが正しければプロフィールを返す', async () => {
    const response = await hosted.fetch(
      new Request('http://example.test/profile', {
        headers: { authorization: 'Bearer loutre-token' },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'user-1',
      name: 'Loutre User',
    })
  })
})
