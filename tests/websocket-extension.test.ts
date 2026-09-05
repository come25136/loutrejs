import { describe, expect, expectTypeOf, it } from 'vitest'
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
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
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
      definition.model.extensions.map(({ extension }) => extension.name),
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
})
