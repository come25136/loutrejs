import {
  Container,
  Logger,
  checkCapabilities,
  type LogRecord,
  type LoggerBackend,
} from '@loutrefw/runtime'

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
        level: 'info',
        message: 'ユーザーを取得しました',
        module: 'UsersModule',
        procedure: 'users.get',
        requestId: 'req-1',
      },
    ])
  })

  it('constructor Loggerにはstatic sourceだけをDI時に付与する', async () => {
    class Consumer {
      constructor(readonly logger: Logger) {}
    }
    const records: LogRecord[] = []
    const dependencies = new Map<Function, readonly [typeof Logger]>([
      [Consumer, [Logger]],
    ])
    const container = new Container([], {
      constructorDependencies: dependencies,
    })
    const consumer = await container.resolve(Consumer)
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
})
