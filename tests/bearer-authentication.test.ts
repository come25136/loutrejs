import { describe, expect, it, vi } from 'vitest'
import {
  authenticateBearer,
  bearerAuth,
  type BearerAuthenticator,
} from '@loutrejs/loutre/http'

describe('Bearer認証の共通関数', () => {
  it('HTTP middlewareはリクエストだけでなくExecutionの中断でも認証を終了する', async () => {
    const execution = new AbortController()
    const requestController = new AbortController()
    const request = new Request('http://test/profile', {
      headers: { authorization: 'Bearer valid' },
      signal: requestController.signal,
    })
    const authenticate = vi.fn<BearerAuthenticator>(() => new Promise(() => {}))
    const layer = bearerAuth({
      realm: 'test',
      factory: () => ({
        authenticate,
        unauthorized: () => new Response(null, { status: 401 }),
      }),
    })
    const next = vi.fn(async () => {})
    const pending = layer.factory()(
      {
        request,
        signal: execution.signal,
        state: {},
        input: { params: {}, query: {}, headers: {}, body: undefined },
      },
      next,
    )
    void pending.catch(() => {})
    try {
      await vi.waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1))
      expect(authenticate.mock.calls[0]![1].signal).toBe(execution.signal)
      const reason = new Error('Executionが終了しました。')
      const rejected = expect(pending).rejects.toBe(reason)
      execution.abort(reason)
      await rejected
      expect(next).not.toHaveBeenCalled()
    } finally {
      requestController.abort()
      execution.abort()
      await pending.catch(() => {})
    }
  })

  it('Bearerを解析して同じ検証関数へtokenとsignalを渡す', async () => {
    const controller = new AbortController()
    const authenticate = vi.fn<BearerAuthenticator<{ id: string }>>(() => ({
      id: 'alice',
    }))
    await expect(
      authenticateBearer('bEaReR valid', authenticate, {
        signal: controller.signal,
      }),
    ).resolves.toEqual({ id: 'alice' })
    expect(authenticate).toHaveBeenCalledExactlyOnceWith('valid', {
      signal: controller.signal,
    })
  })

  it.each([
    null,
    undefined,
    123,
    '',
    'Basic invalid',
    'Bearer',
    'Bearer invalid token',
  ])('不正な資格情報=%sでは検証関数を呼ばない', async (authorization) => {
    const authenticate = vi.fn(() => ({ id: 'alice' }))
    await expect(
      authenticateBearer(authorization, authenticate, {
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull()
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('開始前に中断されていれば検証関数を呼ばない', async () => {
    const controller = new AbortController()
    const reason = new Error('リクエストの中断')
    controller.abort(reason)
    const authenticate = vi.fn(() => ({ id: 'alice' }))
    await expect(
      authenticateBearer('Bearer valid', authenticate, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('中断に非協調な検証の待機を終了し遅い結果を採用しない', async () => {
    const controller = new AbortController()
    let resolve!: (identity: { id: string }) => void
    const authenticate = vi.fn<BearerAuthenticator<{ id: string }>>(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const result = authenticateBearer('Bearer valid', authenticate, {
      signal: controller.signal,
    })
    await Promise.resolve()
    const reason = new Error('認証を中断しました。')
    const rejected = expect(result).rejects.toBe(reason)
    controller.abort(reason)
    await rejected
    resolve({ id: 'late' })
  })

  it('検証サービスの障害を認証拒否に変換しない', async () => {
    const failure = new Error('認証サービスの障害')
    await expect(
      authenticateBearer(
        'Bearer valid',
        () => {
          throw failure
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toBe(failure)
  })

  it('JavaScriptから返されたbooleanを認証成功として扱わない', async () => {
    await expect(
      authenticateBearer('Bearer valid', (() => true) as never, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(TypeError)
  })
})
