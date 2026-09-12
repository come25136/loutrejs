import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import {
  bindWebSocketServer,
  websocket,
  type WebSocketCloseInfo,
  type WebSocketConnectionDriver,
  type WebSocketDataMessage,
  type WebSocketHandlerContext,
  type WebSocketHostApi,
  type WebSocketServerDriver,
} from '@loutrejs/websocket'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

class FixtureConnection implements WebSocketConnectionDriver {
  readonly sent: WebSocketDataMessage[] = []
  readonly closeRequests: {
    readonly code?: number
    readonly reason?: string
  }[] = []
  readonly #closed = deferred<WebSocketCloseInfo>()
  readonly closed = this.#closed.promise
  readonly messages: AsyncIterable<WebSocketDataMessage>

  constructor(source: readonly WebSocketDataMessage[] = []) {
    this.messages = (async function* () {
      yield* source
    })()
  }

  async send(message: WebSocketDataMessage): Promise<void> {
    await Promise.resolve()
    this.sent.push(message)
  }

  async close(code = 1000, reason = ''): Promise<void> {
    this.closeRequests.push({ code, reason })
    this.#closed.resolve({ code, reason, wasClean: true })
  }

  terminate(): void {
    this.#closed.resolve({ code: 1006, reason: '', wasClean: false })
  }

  fail(error: unknown): void {
    this.#closed.reject(error)
  }
}

function fixtureDriver(connection: FixtureConnection): WebSocketServerDriver {
  return {
    runtime: 'test',
    async upgrade() {
      return { response: new Response(null, { status: 200 }), connection }
    },
  }
}

describe('WebSocket Execution Extension', () => {
  it('nested route名を型安全なhandler keyとして公開する', () => {
    const contract = websocket.contract({
      api: {
        path: '/api',
        routes: {
          chat: { path: '/chat' },
        },
      },
    })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        'api.chat': async (context) => {
          await context.close()
        },
      }),
    })

    expectTypeOf<
      keyof ReturnType<typeof controller.factory>
    >().toEqualTypeOf<'api.chat'>()
  })

  it('不正なpath・params・nested route名衝突をModel diagnosticにする', () => {
    const invalidPath = websocket.implementation({
      name: 'invalid-path',
      contract: websocket.contract({ route: { path: 'relative' } }),
      factory: () => ({ route: async () => undefined }),
    })
    const invalidParams = websocket.implementation({
      name: 'invalid-params',
      contract: websocket.contract({
        route: {
          path: '/rooms/{roomId}',
          request: { params: { other: z.string() } },
        },
      }),
      factory: () => ({ route: async () => undefined }),
    })
    const duplicateNestedName = websocket.implementation({
      name: 'duplicate-nested-name',
      contract: websocket.contract({
        'api.chat': { path: '/direct' },
        api: {
          path: '/api',
          routes: { chat: { path: '/chat' } },
        },
      }),
      factory: () => ({
        'api.chat': async () => undefined,
      }),
    })
    const duplicateInheritedResponse = websocket.implementation({
      name: 'duplicate-inherited-response',
      contract: websocket.contract({
        api: {
          responses: { unauthorized: { status: 401 } },
          routes: {
            route: {
              path: '/route',
              responses: { unauthorized: { status: 403 } },
            },
          },
        },
      }),
      factory: () => ({
        'api.route': async () => undefined,
      }),
    })
    const Module = defineModule(() => ({
      executions: [
        invalidPath,
        invalidParams,
        duplicateNestedName,
        duplicateInheritedResponse,
      ],
    }))

    const diagnostics = defineApplication({
      modules: [Module()],
    }).model.diagnostics

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LUTRE_EXTENSION_COMPILE',
          message: expect.stringContaining('Invalid HTTP path'),
        }),
        expect.objectContaining({
          code: 'LUTRE_EXTENSION_COMPILE',
          message: expect.stringContaining(
            'request params must exactly match path parameters',
          ),
        }),
        expect.objectContaining({
          code: 'LUTRE_EXTENSION_COMPILE',
          message: expect.stringContaining(
            'Duplicate nested WebSocket route name',
          ),
        }),
        expect.objectContaining({
          code: 'LUTRE_EXTENSION_COMPILE',
          message: expect.stringContaining(
            'Duplicate inherited WebSocket response',
          ),
        }),
      ]),
    )
  })

  it('1 connectionを1 executionとしてcodecとsend orderingを管理する', async () => {
    const connection = new FixtureConnection([
      { type: 'text', data: '{' },
      { type: 'text', data: JSON.stringify({ type: 'hello' }) },
    ])
    const received: boolean[] = []
    const contract = websocket.contract({
      chat: {
        path: '/rooms/{roomId}/chat',
        request: { params: { roomId: z.string() } },
        messages: websocket.json({
          input: z.object({ type: z.literal('hello') }),
          output: z.object({ sequence: z.number() }),
        }),
      },
    })
    const controller = websocket.implementation({
      name: 'realtime.websocket',
      contract,
      factory: () => ({
        async chat(context) {
          for await (const message of context.input.messages) {
            received.push(message.isValid)
          }
          await Promise.all([
            context.send({ sequence: 1 }),
            context.send({ sequence: 2 }),
            context.send({ sequence: 3 }),
          ])
          await context.close(1000, 'complete')
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const definition = defineApplication({ modules: [Module()] })
    const application = await bootstrapApplication({
      application: definition,
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
    })

    expectTypeOf(application.websocket).toEqualTypeOf<WebSocketHostApi>()
    expectTypeOf<
      Parameters<ReturnType<typeof controller.factory>['chat']>[0]
    >().toEqualTypeOf<
      WebSocketHandlerContext<(typeof contract.routes)['chat']>
    >()
    expect(
      [...definition.model.extensions].map(({ extension }) => extension.name),
    ).toEqual(['@loutrejs/websocket'])

    const response = await application.websocket.upgrade(
      new Request('http://fixture.test/rooms/room-1/chat'),
    )
    expect(response.status).toBe(200)
    await connection.closed
    await Promise.resolve()

    expect(received).toEqual([false, true])
    expect(connection.sent).toEqual([
      { type: 'text', data: JSON.stringify({ sequence: 1 }) },
      { type: 'text', data: JSON.stringify({ sequence: 2 }) },
      { type: 'text', data: JSON.stringify({ sequence: 3 }) },
    ])
    expect(connection.closeRequests).toEqual([
      { code: 1000, reason: 'complete' },
    ])
    await application.close()
  })

  it('Application Model構築後のraw WebSocket Contract mutationをRuntimeへ漏らさない', async () => {
    const connection = new FixtureConnection()
    const route = {
      path: '/snapshot/{roomId}',
      request: { params: { roomId: z.string() } },
    }
    const contract = websocket.contract({ snapshot: route })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async snapshot(context) {
          await context.close(1000, 'done')
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const definition = defineApplication({ modules: [Module()] })

    ;(route.request.params as Record<string, unknown>).roomId = z.number()

    const application = await bootstrapApplication({
      application: definition,
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
    })
    try {
      const response = await application.websocket.upgrade(
        new Request('http://fixture.test/snapshot/stable'),
      )
      expect(response.status).toBe(200)
      await connection.closed
    } finally {
      await application.close()
    }
  })

  it('静的routeをparameter routeより優先し、queryの重複値を保持する', async () => {
    const connection = new FixtureConnection()
    const selected: string[] = []
    const contract = websocket.contract({
      room: {
        path: '/rooms/{roomId}',
        request: { params: { roomId: z.string() } },
      },
      current: {
        path: '/rooms/me',
        request: {
          query: z.object({ tag: z.array(z.string()) }),
        },
      },
    })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async room(context) {
          selected.push(`room:${context.input.params.roomId}`)
          await context.close()
        },
        async current(context) {
          selected.push(`current:${context.input.query.tag.join(',')}`)
          await context.close()
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
    })

    const response = await application.websocket.upgrade(
      new Request('http://fixture.test/rooms/me?tag=first&tag=second'),
    )
    expect(response.status).toBe(200)
    await connection.closed
    expect(selected).toEqual(['current:first,second'])
    await application.close()
  })

  it('decodeできないpath parameterを400として返す', async () => {
    const connection = new FixtureConnection()
    let upgrades = 0
    const contract = websocket.contract({
      room: { path: '/rooms/{roomId}' },
    })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async room(context) {
          await context.close()
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            upgrades += 1
            return { response: new Response(), connection }
          },
        }),
      ],
    })

    const response = await application.websocket.upgrade(
      new Request('http://fixture.test/rooms/%E0%A4%A'),
    )

    expect(response.status).toBe(400)
    expect(upgrades).toBe(0)
    await application.close()
  })

  it('closedがrejectしてもexecution leaseを解放する', async () => {
    const connection = new FixtureConnection()
    const contract = websocket.contract({
      wait: { path: '/wait' },
    })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait(context) {
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
    })
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))

    connection.fail(new Error('transport failure'))
    await expect(application.close()).resolves.toBeUndefined()
  })

  it('複数sessionのdrain失敗をすべて保持する', async () => {
    const firstDrainError = new Error('first terminate failure')
    const secondDrainError = new Error('second terminate failure')
    const firstClosed = deferred<WebSocketCloseInfo>()
    const secondClosed = deferred<WebSocketCloseInfo>()
    const connections: WebSocketConnectionDriver[] = [
      {
        messages: (async function* () {})(),
        closed: firstClosed.promise,
        async send() {},
        async close() {
          firstClosed.resolve({ code: 1001, reason: '', wasClean: false })
          throw new Error('close failure')
        },
        terminate() {
          throw firstDrainError
        },
      },
      {
        messages: (async function* () {})(),
        closed: secondClosed.promise,
        async send() {},
        async close() {
          secondClosed.resolve({ code: 1001, reason: '', wasClean: false })
          throw new Error('close failure')
        },
        terminate() {
          throw secondDrainError
        },
      },
    ]
    const contract = websocket.contract({
      wait: { path: '/wait' },
    })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait(context) {
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            return {
              response: new Response(),
              connection: connections.shift()!,
            }
          },
        }),
      ],
    })
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))

    await expect(application.close()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AggregateError &&
        error.errors.some(
          (nested) =>
            nested instanceof AggregateError &&
            nested.errors.includes(firstDrainError) &&
            nested.errors.includes(secondDrainError),
        ),
    )
  })

  it('shutdown時にactive sessionを1001でdrainしてから終了する', async () => {
    const connection = new FixtureConnection()
    let executionSignal: AbortSignal | undefined
    const contract = websocket.contract({
      wait: { path: '/wait' },
    })
    const controller = websocket.implementation({
      name: 'wait.websocket',
      contract,
      factory: () => ({
        async wait(context) {
          executionSignal = context.signal
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
    })
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))

    await application.close()

    expect(connection.closeRequests).toEqual([
      { code: 1001, reason: 'Going Away' },
    ])
    expect(executionSignal?.aborted).toBe(true)
  })

  it('graceful closeが応答しなくてもhard shutdown budgetより前にterminateする', async () => {
    vi.useFakeTimers()
    try {
      const closed = deferred<WebSocketCloseInfo>()
      let terminateAttempts = 0
      const connection: WebSocketConnectionDriver = {
        messages: (async function* () {})(),
        closed: closed.promise,
        async send() {},
        async close() {
          await new Promise<void>(() => undefined)
        },
        terminate() {
          terminateAttempts += 1
          closed.resolve({ code: 1006, reason: '', wasClean: false })
        },
      }
      const contract = websocket.contract({ wait: { path: '/wait' } })
      const controller = websocket.implementation({
        contract,
        factory: () => ({
          async wait(context) {
            await context.closed
          },
        }),
      })
      const Module = defineModule(() => ({ executions: [controller] }))
      const application = await bootstrapApplication({
        application: defineApplication({ modules: [Module()] }),
        capabilities: [
          bindWebSocketServer({
            runtime: 'test',
            async upgrade() {
              return { response: new Response(), connection }
            },
          }),
        ],
      })
      await application.websocket.upgrade(
        new Request('http://fixture.test/wait'),
      )

      const closing = application.close()
      await vi.advanceTimersByTimeAsync(5_000)

      await expect(closing).resolves.toBeUndefined()
      expect(terminateAttempts).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('transport終了後もhandlerが残る場合はshutdown timeoutでsafe boundaryを返す', async () => {
    const connection = new FixtureConnection()
    const events: string[] = []
    const contract = websocket.contract({ wait: { path: '/wait' } })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait() {
          await new Promise<void>(() => undefined)
        },
      }),
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [controller],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindWebSocketServer(fixtureDriver(connection))],
      forceShutdownTimeoutMs: 10,
    })
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))

    await expect(
      Promise.race([
        application.close(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('shutdown hung')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(connection.closeRequests).toEqual([
      { code: 1001, reason: 'Going Away' },
    ])
    expect(events).toEqual([])
  })

  it('shutdown開始と同一tickの新規upgradeを503で拒否する', async () => {
    const connection = new FixtureConnection()
    let upgrades = 0
    const contract = websocket.contract({ wait: { path: '/wait' } })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait(context) {
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            upgrades += 1
            return { response: new Response(), connection }
          },
        }),
      ],
    })

    const closing = application.close()
    const response = application.websocket.upgrade(
      new Request('http://fixture.test/wait'),
    )

    await expect(response).resolves.toHaveProperty('status', 503)
    await expect(closing).resolves.toBeUndefined()
    expect(upgrades).toBe(0)
  })

  it('upgrade待機中に始まったshutdownは後から確立したsessionも停止する', async () => {
    const connection = new FixtureConnection()
    const upgradeStarted = deferred<void>()
    const resumeUpgrade = deferred<void>()
    const contract = websocket.contract({ wait: { path: '/wait' } })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait(context) {
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            upgradeStarted.resolve()
            await resumeUpgrade.promise
            return {
              response: new Response(null, { status: 200 }),
              connection,
            }
          },
        }),
      ],
    })
    const upgrade = application.websocket.upgrade(
      new Request('http://fixture.test/wait'),
    )
    await upgradeStarted.promise

    const closing = application.close()
    resumeUpgrade.resolve()

    await expect(
      Promise.race([
        closing.then(() => 'closed' as const),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 250),
        ),
      ]),
    ).resolves.toBe('closed')
    await expect(upgrade).resolves.toHaveProperty('status', 503)
    expect(connection.closeRequests).toEqual([
      { code: 1001, reason: 'Going Away' },
    ])
  })

  it('drain失敗後のshutdown再試行で残存sessionを再度terminateする', async () => {
    const closed = deferred<WebSocketCloseInfo>()
    let terminateAttempts = 0
    const connection: WebSocketConnectionDriver = {
      messages: (async function* () {})(),
      closed: closed.promise,
      async send() {},
      async close() {
        throw new Error('close failure')
      },
      terminate() {
        terminateAttempts += 1
        if (terminateAttempts === 1) {
          throw new Error('first terminate failure')
        }
        closed.resolve({ code: 1006, reason: '', wasClean: false })
      },
    }
    const contract = websocket.contract({ wait: { path: '/wait' } })
    const controller = websocket.implementation({
      contract,
      factory: () => ({
        async wait(context) {
          await context.closed
        },
      }),
    })
    const Module = defineModule(() => ({ executions: [controller] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [
        bindWebSocketServer({
          runtime: 'test',
          async upgrade() {
            return { response: new Response(), connection }
          },
        }),
      ],
      forceShutdownTimeoutMs: 10,
    })
    await application.websocket.upgrade(new Request('http://fixture.test/wait'))

    await expect(application.close()).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(terminateAttempts).toBe(1)

    await expect(application.close()).resolves.toBeUndefined()
    expect(terminateAttempts).toBe(2)
  })
})
