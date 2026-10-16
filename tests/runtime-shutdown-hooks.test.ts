import { EventEmitter } from 'node:events'
import { ProcessShutdownHooks } from '@loutrejs/loutre/runtime'

describe('Process shutdown hookの所有権', () => {
  it('複数Applicationは互いのlistenerを消さず、各Applicationを一度だけ終了する', async () => {
    const source = new EventEmitter()
    const firstClose = vi.fn(async () => {})
    const secondClose = vi.fn(async () => {})
    const onError = vi.fn()
    const first = new ProcessShutdownHooks({
      source,
      close: firstClose,
      onError,
    })
    const second = new ProcessShutdownHooks({
      source,
      close: secondClose,
      onError,
    })
    first.setEnabled(true)
    second.setEnabled(true)
    first.dispose()
    source.emit('SIGTERM')
    source.emit('SIGINT')
    await Promise.resolve()
    expect(firstClose).not.toHaveBeenCalled()
    expect(secondClose).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(source.listenerCount('SIGTERM')).toBe(0)
    expect(source.listenerCount('SIGINT')).toBe(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('設定変更は重複登録せず、終了後は再登録しない', () => {
    const source = new EventEmitter()
    const hooks = new ProcessShutdownHooks({
      source,
      close: vi.fn(async () => {}),
      onError: vi.fn(),
    })
    hooks.setEnabled(true)
    hooks.setEnabled(true)
    expect(source.listenerCount('SIGINT')).toBe(1)
    hooks.setEnabled(false)
    expect(source.listenerCount('SIGINT')).toBe(0)
    hooks.setEnabled(true)
    expect(source.listenerCount('SIGINT')).toBe(1)
    hooks.dispose()
    hooks.setEnabled(true)
    expect(source.listenerCount('SIGINT')).toBe(0)
  })

  it.each(['同期', '非同期'])(
    '%sのclose失敗を観測し、終了処理失敗後もlistenerを残さない',
    async (kind) => {
      const source = new EventEmitter()
      const error = new Error('close failed')
      const onError = vi.fn()
      const hooks = new ProcessShutdownHooks({
        source,
        close: () => {
          if (kind === '同期') throw error
          return Promise.reject(error)
        },
        onError,
      })
      hooks.setEnabled(true)
      source.emit('SIGINT')
      await Promise.resolve()
      expect(onError).toHaveBeenCalledExactlyOnceWith(error, 'SIGINT')
      expect(source.listenerCount('SIGINT')).toBe(0)
      expect(source.listenerCount('SIGTERM')).toBe(0)
    },
  )

  it('error reporterの失敗も未処理のPromise rejectionにしない', async () => {
    const source = new EventEmitter()
    const error = new Error('close failed')
    const reportingError = new Error('report failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const hooks = new ProcessShutdownHooks({
        source,
        close: async () => {
          throw error
        },
        onError: () => {
          throw reportingError
        },
      })
      hooks.setEnabled(true)
      source.emit('SIGTERM')
      await Promise.resolve()
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(
        'Runtime shutdown error reporter failed',
        error,
        reportingError,
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
