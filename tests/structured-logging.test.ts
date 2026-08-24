import {
  contract,
  defineError,
  defineModule,
  implement,
  procedure,
} from '@loutrejs/core'
import { createHttpApplication, http } from '@loutrejs/http'
import {
  createMessagePortApplication,
  HandlerOf,
  messagePort,
  MessageContextOf,
} from '@loutrejs/message-port'
import {
  ConsoleLoggerBackend,
  JsonConsoleLoggerBackend,
  Logger,
  type LogRecord,
  type LoggerBackend,
} from '@loutrejs/runtime'
import { z } from 'zod'

describe('構造化ログ', () => {
  it('予約fieldを保護し、JSON化できない値も1行のJSONとして出力する', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const circular: Record<string, unknown> = { count: 1n }
    circular.self = circular

    try {
      new Logger(new JsonConsoleLoggerBackend()).info('安全なログ', {
        level: 'error',
        message: '上書きされない値',
        payload: circular,
        error: new Error('fixture'),
      })

      expect(output).toHaveBeenCalledOnce()
      const record = JSON.parse(output.mock.calls[0]?.[0] as string)
      expect(record).toMatchObject({
        level: 'info',
        message: '安全なログ',
        payload: { count: '1', self: '[Circular]' },
        error: { name: 'Error', message: 'fixture' },
      })
      expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp)
    } finally {
      output.mockRestore()
    }
  })

  it('既定Console backendをNestJS風に色付きで整形する', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      const logger = new Logger(
        new ConsoleLoggerBackend({ colors: true }),
        { source: 'UsersService', application: 'api' },
      )
      logger.info('ユーザーを取得しました', {
        requestId: 'req-1',
        result: { count: 1 },
      })

      expect(output).toHaveBeenCalledOnce()
      const formatted = output.mock.calls[0]?.[0] as string
      const plain = stripAnsi(formatted)
      expect(plain).toMatch(/^\[Loutre\](?: \d+)?  - /u)
      expect(plain).toContain('    LOG [UsersService] ユーザーを取得しました')
      expect(plain).toContain('application=api')
      expect(plain).toContain('requestId=req-1')
      expect(plain).toContain('result={ count=1 }')
      expect(formatted).toContain('\u001B[32m')
      expect(formatted).toContain('\u001B[33m[UsersService]')
      expect(formatted).toContain('\u001B[90m{ ')
    } finally {
      output.mockRestore()
    }
  })

  it('route未一致を相関可能なHTTP完了イベントとして記録する', async () => {
    const records: LogRecord[] = []
    const logger = captureLogger(records, { application: 'fixture' })
    const application = createHttpApplication({ modules: [], logger })

    const response = await application.handle(
      new Request('https://fixture.test/missing?secret=value'),
    )

    expect(response.status).toBe(404)
    expect(records).toHaveLength(1)
    expect(records[0]).toEqual(expect.objectContaining({
      application: 'fixture',
      protocol: 'http',
      event: 'http.request.completed',
      method: 'GET',
      path: '/missing',
      status: 404,
      durationMs: expect.any(Number),
      executionId: expect.stringMatching(/^[0-9a-f-]+$/),
    }))
    expect(records[0]).not.toHaveProperty('query')
    expect(records[0]).not.toHaveProperty('headers')
    expect(records[0]).not.toHaveProperty('body')
  })

  it('未処理例外とHTTP responseを同じerrorIdで関連付ける', async () => {
    const Contract = contract({
      fail: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/fail',
            responses: {
              ok: { status: 200, body: z.object({ ok: z.boolean() }) },
            },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    class Implementation {
      fail(): never {
        throw new Error('fixture failure')
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const records: LogRecord[] = []
    const application = createHttpApplication({
      modules: [Module()],
      logger: captureLogger(records),
    })

    const response = await application.handle(
      new Request('https://fixture.test/fail'),
    )
    const body = await response.json() as { errorId: string }

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Internal Server Error',
      errorId: expect.stringMatching(/^[0-9a-f-]+$/),
    })
    expect(JSON.stringify(body)).not.toContain('fixture failure')
    const errorRecord = records.find((record) => record.event === 'application.error')
    expect(errorRecord).toEqual(expect.objectContaining({
      level: 'error',
      procedure: 'fail',
      source: 'Implementation.fail',
      error: expect.objectContaining({
        id: body.errorId,
        message: 'fixture failure',
      }),
    }))
    expect(records.at(-1)).toEqual(expect.objectContaining({
      event: 'http.request.completed',
      status: 500,
      executionId: errorRecord?.executionId,
    }))
  })

  it('宣言済みDomain Error mappingをunhandled errorとして重複記録しない', async () => {
    const ExpectedError = defineError({
      code: 'EXPECTED_ERROR',
      data: z.object({ reason: z.string() }),
    })
    const Contract = contract({
      fail: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/expected-failure',
            responses: {
              rejected: {
                status: 409,
                body: z.object({ reason: z.string() }),
                error: http.error(ExpectedError),
              },
            },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    class Implementation {
      fail(): never {
        throw ExpectedError({ reason: 'expected' })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const records: LogRecord[] = []
    const application = createHttpApplication({
      modules: [Module()],
      logger: captureLogger(records),
    })

    const response = await application.handle(
      new Request('https://fixture.test/expected-failure'),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ reason: 'expected' })
    expect(records).not.toContainEqual(
      expect.objectContaining({ event: 'application.error' }),
    )
    expect(records).toContainEqual(expect.objectContaining({
      event: 'http.request.completed',
      status: 409,
    }))
  })

  it('MessagePortの完了イベントを共通Loggerへ記録する', async () => {
    const Contract = contract({
      ping: procedure({
        protocols: {
          messagePort: messagePort({
            responses: { ok: { body: z.literal('pong') } },
            pipeline: [messagePort.handler],
          }),
        },
      }),
    })
    type Handler = HandlerOf<typeof Contract, 'messagePort'>
    class Implementation implements Handler {
      ping(ctx: MessageContextOf<Handler, 'ping'>) {
        return ctx.message.ok('pong')
      }
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract).for(messagePort).with(Implementation),
      ],
    }))
    const records: LogRecord[] = []
    const application = createMessagePortApplication({
      modules: [Module()],
      logger: captureLogger(records),
    })

    const result = await application.invoke('ping')

    expect(result).toEqual({
      kind: 'message-port-result',
      variant: 'ok',
      value: 'pong',
    })
    expect(records).toContainEqual(expect.objectContaining({
      level: 'info',
      protocol: 'messagePort',
      procedure: 'ping',
      source: 'Implementation.ping',
      event: 'message_port.invocation.completed',
      durationMs: expect.any(Number),
      executionId: expect.stringMatching(/^[0-9a-f-]+$/),
    }))
  })
})

function captureLogger(
  records: LogRecord[],
  context: Readonly<Record<string, unknown>> = {},
): Logger {
  const backend: LoggerBackend = {
    write: (record) => records.push(record),
  }
  return new Logger(backend, context)
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
}
