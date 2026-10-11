import { nodeRuntime } from '@loutrejs/node'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
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

  it('Bunのnative stopが完了しなくてもexecutionとproviderを回収して終了する', async () => {
    const fixture = blockingSseFixture()
    let handler:
      | ((
          request: Request,
          server: never,
        ) => Response | undefined | Promise<Response | undefined>)
      | undefined
    vi.stubGlobal('Bun', {
      env: {},
      version: 'test',
      serve(options: { fetch: NonNullable<typeof handler> }) {
        handler = options.fetch
        return {
          stop(force: boolean) {
            fixture.events.push(`server.stop(${force})`)
            return new Promise<void>(() => {})
          },
          unref() {
            fixture.events.push('server.unref')
          },
        }
      },
    })
    const application = await bunRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 50,
    })
    await application.serve({ port: 3000, shutdownHooks: false })
    const response = await handler!(
      new Request('http://127.0.0.1:3000/events'),
      undefined as never,
    )
    const reader = response!.body!.getReader()
    await reader.read()
    await expect(
      withHangGuard(application.close(), 500),
    ).resolves.toBeUndefined()
    await application.close()
    expect(fixture.events).toEqual([
      'iterator.return',
      'provider.destroy',
      'server.stop(false)',
      'server.stop(true)',
      'server.unref',
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
