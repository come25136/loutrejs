import { runtimeSupportFeatures } from '@loutrejs/loutre/runtime'
import {
  Container,
  Logger,
  SilentLogger,
  checkRuntimeSupport,
  type LogRecord,
  type LoggerBackend,
} from '@loutrejs/loutre/runtime'
import {
  buildApplicationModel,
  inject,
  normalizeProvider,
  provide,
  LoggerToken,
} from '@loutrejs/loutre'

describe('CapabilityとLogger', () => {
  it('Modelの既定Logger ProviderをContainerで二重登録しない', () => {
    const model = buildApplicationModel({ modules: [] })
    const container = new Container(model.providers)
    expect(container.resolve(Logger).backend).toBe(
      container.get(Logger).backend,
    )
  })
  it('Application requirementとRuntime capabilityの差分を返す', () => {
    const result = checkRuntimeSupport(['http.server', 'stream.readable'], {
      runtime: 'fixture',
      capabilities: runtimeSupportFeatures(['http.server']),
    })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['stream.readable'])
  })

  it('Loggerの設定とログ出力時のstructured contextを結合する', () => {
    const records: LogRecord[] = []
    const backend: LoggerBackend = {
      write: (record) => records.push(record),
    }
    const logger = new Logger(backend, { module: 'UsersModule' })
    logger.info('ユーザーを取得しました', {
      procedure: 'users.get',
      requestId: 'req-1',
    })

    expect(records).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        message: 'ユーザーを取得しました',
        source: 'Application',
        module: 'UsersModule',
        procedure: 'users.get',
        requestId: 'req-1',
      },
    ])
  })

  it('SilentLoggerはconsoleへ出力しない', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const logger = new SilentLogger({ application: 'test', source: 'fixture' })
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
    const ROOT = LoggerToken
    const container = new Container([
      normalizeProvider(Consumer),
      provide(ROOT).useFactory({ use: () => rootLogger }),
    ])

    const consumer = container.resolve(Consumer)
    consumer.logger.info('DIから出力しました')

    expect(records[0]).toEqual(
      expect.objectContaining({
        application: 'fixture',
        source: 'Consumer',
        message: 'DIから出力しました',
      }),
    )
  })
})
