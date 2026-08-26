import {
  Container,
  Logger,
  SilentLogger,
  checkCapabilities,
  type LogRecord,
  type LoggerBackend,
} from '@loutrejs/runtime'
import { inject, normalizeProvider } from '@loutrejs/core'

describe('CapabilityとLogger', () => {
  it('Application requirementとRuntime capabilityの差分を返す', () => {
    const result = checkCapabilities(['http.server', 'stream.readable'], {
      runtime: 'fixture',
      capabilities: new Set(['http.server']),
    })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['stream.readable'])
  })

  it('structured contextをchild Loggerへ引き継ぐ', () => {
    const records: LogRecord[] = []
    const backend: LoggerBackend = {
      write: (record) => records.push(record),
    }
    const logger = new Logger(backend, { module: 'UsersModule' }).child({
      procedure: 'users.get',
    })
    logger.info('ユーザーを取得しました', { requestId: 'req-1' })

    expect(records).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        message: 'ユーザーを取得しました',
        module: 'UsersModule',
        procedure: 'users.get',
        requestId: 'req-1',
      },
    ])
  })

  it('SilentLoggerはchildを含めてconsoleへ出力しない', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const logger = new SilentLogger({ application: 'test' }).child({ source: 'fixture' })
    logger.debug('debug')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')

    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()

    log.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })

  it('constructor Loggerにはstatic sourceだけをDI時に付与する', () => {
    class Consumer {
      constructor(readonly logger = inject(Logger)) {}
    }
    const records: LogRecord[] = []
    const container = new Container([normalizeProvider(Consumer)])
    const consumer = container.resolve(Consumer)
    const contextual = new Logger(
      { write: (record) => records.push(record) },
      consumer.logger.context,
    )
    contextual.info('実行しました')

    expect(records[0]).toEqual(
      expect.objectContaining({
        source: 'Consumer',
      }),
    )
    expect(records[0]).not.toHaveProperty('executionId')
  })

  it('Containerへ渡したLogger backendをconstructor Loggerでも共有する', () => {
    class Consumer {
      constructor(readonly logger = inject(Logger)) {}
    }
    const records: LogRecord[] = []
    const rootLogger = new Logger(
      { write: (record) => records.push(record) },
      { application: 'fixture' },
    )
    const container = new Container([normalizeProvider(Consumer)], rootLogger)

    const consumer = container.resolve(Consumer)
    consumer.logger.info('DIから出力しました')

    expect(records[0]).toEqual(expect.objectContaining({
      application: 'fixture',
      source: 'Consumer',
      message: 'DIから出力しました',
    }))
  })
})
