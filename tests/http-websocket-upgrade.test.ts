import { describe, expect, it } from 'vitest'
import { http } from '@loutrejs/loutre/http'

describe('WebSocketへのUpgrade要求の判定', () => {
  it.each([
    { headers: {}, expected: false },
    { headers: { upgrade: 'websocket' }, expected: true },
    { headers: { Upgrade: 'WebSocket' }, expected: true },
    { headers: { upgrade: 'WEBSOCKET' }, expected: true },
    { headers: { upgrade: 'h2c' }, expected: false },
    { headers: { upgrade: 'not-websocket' }, expected: false },
    { headers: { upgrade: '' }, expected: false },
    { headers: { connection: 'Upgrade' }, expected: false },
  ])('ヘッダー判定 %j', ({ headers, expected }) => {
    const request = new Request('http://test/graphql', { headers })
    expect(http.isWebSocketUpgrade(request)).toBe(expected)
  })

  it('handshake全体の検証を代行せず、Upgrade先だけを判定する', () => {
    const request = new Request('http://test/graphql', {
      method: 'POST',
      headers: { upgrade: 'websocket' },
    })
    expect(http.isWebSocketUpgrade(request)).toBe(true)
  })
})
