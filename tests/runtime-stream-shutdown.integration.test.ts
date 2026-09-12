import { nodeRuntime } from '@loutrejs/node'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { z } from 'zod'
import { reserveHttpPort } from './helpers/http-server.js'
import { silentLogger } from './helpers/silent-logger.js'

describe('runtime streaming shutdown lifetime', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('Nodeはlistener closeを開始してからKernel drainで未完了SSEを回収する', async () => {
    const fixture = blockingSseFixture()
    const port = await reserveHttpPort()
    const application = await nodeRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 50,
    })
    const listener = await application.serve({
      port,
      hostname: '127.0.0.1',
      shutdownHooks: false,
    })
    const response = await fetch(`http://127.0.0.1:${port}/events`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SSE response body is missing')
    await reader.read()

    await expect(
      withHangGuard(application.close(), 500),
    ).resolves.toBeUndefined()

    expect(listener.server.listening).toBe(false)
    expect(fixture.events).toEqual(['iterator.return', 'provider.destroy'])
  })

  it('Denoはshutdown開始後にKernel drainで未完了SSEを回収してからlistener完了を待つ', async () => {
    const fixture = blockingSseFixture()
    let handler:
      | ((request: Request) => Response | Promise<Response>)
      | undefined
    let responseFinished: Promise<void> = Promise.resolve()
    vi.stubGlobal('Deno', {
      env: { get: () => undefined, toObject: () => ({}) },
      version: { deno: 'test' },
      serve: (
        _options: unknown,
        candidate: (request: Request) => Response | Promise<Response>,
      ) => {
        handler = candidate
        return {
          shutdown: () => {
            fixture.events.push('server.shutdown')
            return responseFinished
          },
        }
      },
    })
    const application = await denoRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 50,
    })
    await application.serve({
      port: 3000,
      hostname: '127.0.0.1',
      shutdownHooks: false,
    })
    if (!handler) throw new Error('Deno.serve handler was not registered')
    const response = await handler(new Request('http://127.0.0.1:3000/events'))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SSE response body is missing')
    await reader.read()
    responseFinished = reader.read().then(
      () => undefined,
      () => undefined,
    )

    await expect(
      withHangGuard(application.close(), 500),
    ).resolves.toBeUndefined()

    expect(fixture.events).toEqual([
      'server.shutdown',
      'iterator.return',
      'provider.destroy',
    ])
  })
})

function blockingSseFixture() {
  const events: string[] = []
  type Event = { readonly sequence: number }
  let nextCount = 0
  let resolvePendingNext: ((result: IteratorResult<Event>) => void) | undefined
  const iterator: AsyncIterator<Event> = {
    next() {
      if (nextCount++ === 0) {
        return Promise.resolve({ done: false, value: { sequence: 1 } })
      }
      return new Promise<IteratorResult<Event>>((resolve) => {
        resolvePendingNext = resolve
      })
    },
    async return() {
      events.push('iterator.return')
      resolvePendingNext?.({ done: true, value: undefined })
      return { done: true, value: undefined }
    },
  }
  const source: AsyncIterable<Event> = {
    [Symbol.asyncIterator]: () => iterator,
  }
  class Resource {
    onModuleDestroy() {
      events.push('provider.destroy')
    }
  }
  const contract = http.contract({
    events: {
      method: 'GET',
      path: '/events',
      interaction: 'server-stream',
      responses: {
        events: {
          status: 200,
          body: z.object({ sequence: z.number() }),
          stream: 'server',
        },
      },
    },
  })
  const controller = http.implementation({
    contract,
    factory: (resource = inject(Resource)) => ({
      events: (context) => {
        void resource
        return context.response.events({ body: source })
      },
    }),
  })
  const Module = defineModule(() => ({
    providers: [Resource],
    executions: [controller],
  }))

  return {
    definition: defineApplication({
      modules: [Module()],
      logger: silentLogger,
    }),
    events,
  }
}

function withHangGuard<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('shutdown hung')), timeoutMs),
    ),
  ])
}
