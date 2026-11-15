import { describe, expect, it, vi } from 'vitest'
import { parse } from 'graphql'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
  inject,
} from '@loutrejs/loutre'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import {
  bindWebSocketServer,
  createWebSocketDriverChannel,
  type WebSocketDriverChannel,
} from '@loutrejs/loutre/websocket'
import { graphql } from '@loutrejs/graphql'
import { bindManifest } from '@loutrejs/graphql/runtime'
import { getManifest } from '../packages/graphql/src/manifest-internal.js'
import { subscribeManifest } from '../packages/graphql/src/execution.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

interface Context {
  readonly signal: AbortSignal
  readonly resource: { readonly destroyed: boolean }
}

async function fixture(
  options: {
    init?: (context: Context) => Promise<void>
    context?: (context: Context) => Promise<void>
    resolve?: (context: Context) => Promise<string>
    fail?: () => Promise<never>
    load?: (context: Context) => Promise<readonly string[]>
    subscribe?: (context: Context) => AsyncIterable<unknown>
  } = {},
) {
  const events: string[] = []
  const completedOperations: string[] = []
  class Resource {
    destroyed = false
    onModuleDestroy() {
      this.destroyed = true
      events.push('provider.destroy')
    }
  }
  const manifest = bindManifest<Context>({
    schemaDocument: parse(
      'type Query { ready: String! fail: String! parents: [Parent!]! } type Parent { child: String fail: String! waiting: String } type Subscription { values: [Parent!]! }',
    ),
    resolvers: {
      Query: {
        ready: ({ context }: { context: Context }) =>
          options.resolve?.(context) ?? '完了',
        parents: () => [{}],
        fail: () => options.fail?.() ?? '完了',
      },
      Parent: {
        fail: () => options.fail?.() ?? '完了',
        waiting: ({ context }: { context: Context }) =>
          options.resolve?.(context) ?? '完了',
        child: {
          load: ({
            context,
            signal,
          }: {
            context: Context
            signal: AbortSignal
          }) => options.load?.({ ...context, signal }) ?? ['取得済み'],
        },
      },
      Subscription: {
        values: {
          subscribe: ({ context }: { context: Context }) =>
            options.subscribe?.(context) ??
            (async function* () {
              yield [{}]
            })(),
          resolve: ({ parent }: { parent: unknown }) => parent,
        },
      },
    },
  })
  const endpoint = graphql.implementation({
    name: 'Api',
    route: http.contract({
      endpoint: { raw: true, method: '*', path: '/graphql' },
    }).routes.endpoint,
    manifest,
    transports: { websocket: true },
    factory: (resource = inject(Resource)) => ({
      async context({ signal }) {
        const context = { signal, resource }
        await options.context?.(context)
        return context
      },
      ws: {
        async connectionInit({ signal }) {
          await options.init?.({ signal, resource })
          return {}
        },
        onClose() {
          events.push('connection.close')
        },
      },
    }),
  })
  let channel: WebSocketDriverChannel | undefined
  const sent: { type: string; id?: string | undefined }[] = []
  const application = await bootstrapApplication({
    application: defineApplication({
      modules: [
        defineModule({ providers: [Resource], executions: [endpoint] }),
      ],
    }),
    capabilities: [
      bindHttpServer({ runtime: 'test' }),
      bindWebSocketServer({
        runtime: 'test',
        async upgrade() {
          const connection = createWebSocketDriverChannel({
            protocol: 'graphql-transport-ws',
            async send(message) {
              if (message.kind !== 'text')
                throw new Error('text frameが必要です。')
              const value: unknown = JSON.parse(message.data)
              sent.push(
                z
                  .object({ type: z.string(), id: z.string().optional() })
                  .parse(value),
              )
            },
            async close(code = 1000, reason = '') {
              connection.finish({ code, reason, wasClean: true })
            },
            terminate() {
              connection.finish({ code: 1006, reason: '', wasClean: false })
            },
          })
          channel = connection
          return { response: new Response(), connection: connection.connection }
        },
      }),
    ],
    forceShutdownTimeoutMs: 20,
    instrumentation: {
      beginOperation(metadata) {
        return {
          complete() {
            completedOperations.push(metadata.kind)
          },
        }
      },
    },
  })
  return {
    application,
    events,
    sent,
    completedOperations,
    request(query: string, signal?: AbortSignal) {
      return application.http.fetch(
        new Request(
          `http://fixture.test/graphql?query=${encodeURIComponent(query)}`,
          signal ? { signal } : {},
        ),
      )
    },
    async open() {
      await application.websocket.upgrade(
        new Request('http://fixture.test/graphql', {
          headers: { 'sec-websocket-protocol': 'graphql-transport-ws' },
        }),
      )
      if (!channel) throw new Error('接続がありません。')
      const active = channel
      return {
        send(value: object) {
          active.receive({ kind: 'text', data: JSON.stringify(value) })
        },
        disconnect() {
          active.finish({ code: 1000, reason: '', wasClean: true })
        },
        wait(type: string) {
          return vi.waitFor(() =>
            expect(sent.some((message) => message.type === type)).toBe(true),
          )
        },
      }
    },
  }
}

describe('GraphQLの終了とProviderの寿命', () => {
  it.each(['http', 'websocket'] as const)(
    '%sで別FieldのNonNullエラーが発生しても実行中のresolverの完了までProviderを保持する',
    async (transport) => {
      const started = deferred<Context>()
      const gate = deferred<void>()
      const api = await fixture({
        async fail() {
          await started.promise
          throw new Error('NonNull Fieldの失敗')
        },
        async resolve(context) {
          started.resolve(context)
          await gate.promise
          expect(context.resource.destroyed).toBe(false)
          return '完了'
        },
      })
      let response: Promise<Response> | undefined
      try {
        if (transport === 'http') response = api.request('{fail ready}')
        else {
          const connection = await api.open()
          connection.send({ type: 'connection_init' })
          await connection.wait('connection_ack')
          connection.send({
            type: 'subscribe',
            id: '1',
            payload: { query: 'subscription{values{fail waiting}}' },
          })
        }
        await started.promise
        await expect(api.application.close()).rejects.toMatchObject({
          safeCleanupBoundaryReached: false,
        })
        expect(api.events).not.toContain('provider.destroy')
        gate.resolve()
        await response
        await api.application.close()
        expect(api.events.at(-1)).toBe('provider.destroy')
      } finally {
        gate.resolve()
        await response
        await api.application.close()
      }
    },
  )

  it.each(['disconnect', 'drain'] as const)(
    'ConnectionInit中の%sは実処理の完了までProviderを保持し、遅い成功を送らない',
    async (mode) => {
      const started = deferred<Context>()
      const gate = deferred<void>()
      const api = await fixture({
        async init(context) {
          started.resolve(context)
          await gate.promise
          expect(context.resource.destroyed).toBe(false)
        },
      })
      try {
        const connection = await api.open()
        connection.send({ type: 'connection_init' })
        const context = await started.promise
        if (mode === 'disconnect') connection.disconnect()
        await expect(api.application.close()).rejects.toMatchObject({
          safeCleanupBoundaryReached: false,
        })
        expect(context.signal.aborted).toBe(true)
        expect(api.events).toEqual([])
        gate.resolve()
        await api.application.close()
        expect(api.events).toEqual(['connection.close', 'provider.destroy'])
        expect(api.sent).toEqual([])
      } finally {
        gate.resolve()
        await api.application.close()
      }
    },
  )

  it('中断後のConnectionInitの失敗でもonCloseとProviderの破棄を一度ずつ行う', async () => {
    const started = deferred<void>()
    const gate = deferred<void>()
    const api = await fixture({
      async init() {
        started.resolve()
        await gate.promise
      },
    })
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await started.promise
      connection.disconnect()
      await expect(api.application.close()).rejects.toMatchObject({
        safeCleanupBoundaryReached: false,
      })
      gate.reject(new Error('遅い失敗'))
      await api.application.close()
      await api.application.close()
      expect(api.events).toEqual(['connection.close', 'provider.destroy'])
    } finally {
      gate.resolve()
      await api.application.close()
    }
  })

  it.each(['context', 'resolve', 'load'] as const)(
    'HTTPの%sへKernelの中断を伝え、処理完了後にProviderを破棄する',
    async (phase) => {
      const started = deferred<Context>()
      const waitForAbort = async (context: Context) => {
        started.resolve(context)
        await new Promise<void>((resolve) => {
          if (context.signal.aborted) resolve()
          else
            context.signal.addEventListener('abort', () => resolve(), {
              once: true,
            })
        })
        expect(context.resource.destroyed).toBe(false)
      }
      const api = await fixture({
        ...(phase === 'context' ? { context: waitForAbort } : {}),
        ...(phase === 'resolve'
          ? {
              resolve: async (context: Context) => {
                await waitForAbort(context)
                return '完了'
              },
            }
          : {}),
        ...(phase === 'load'
          ? {
              load: async (context: Context) => {
                await waitForAbort(context)
                return ['取得済み']
              },
            }
          : {}),
      })
      const controller = new AbortController()
      const request = api.request(
        phase === 'load' ? '{parents{child}}' : '{ready}',
        controller.signal,
      )
      try {
        await started.promise
        await expect(api.application.close()).rejects.toThrow(
          'Application shutdown',
        )
        expect((await started.promise).signal.aborted).toBe(true)
        await request
        await api.application.close()
        expect(api.events).toEqual(['provider.destroy'])
      } finally {
        controller.abort()
        await request
        await api.application.close()
      }
    },
  )

  it.each(['http', 'websocket'] as const)(
    '%sの中断後も継続するBatch loadの完了までProviderを保持する',
    async (transport) => {
      const started = deferred<Context>()
      const gate = deferred<void>()
      const api = await fixture({
        async load(context) {
          started.resolve(context)
          await gate.promise
          expect(context.resource.destroyed).toBe(false)
          return ['取得済み']
        },
      })
      let response: Promise<Response> | undefined
      const controller = new AbortController()
      try {
        if (transport === 'http')
          response = api.request('{parents{child}}', controller.signal)
        else {
          const connection = await api.open()
          connection.send({ type: 'connection_init' })
          await connection.wait('connection_ack')
          connection.send({
            type: 'subscribe',
            id: '1',
            payload: { query: 'subscription{values{child}}' },
          })
        }
        const context = await started.promise
        controller.abort()
        await expect(api.application.close()).rejects.toMatchObject({
          safeCleanupBoundaryReached: false,
        })
        expect(context.signal.aborted).toBe(true)
        expect(api.events).not.toContain('provider.destroy')
        gate.resolve()
        await response
        await api.application.close()
        expect(api.events.at(-1)).toBe('provider.destroy')
      } finally {
        gate.resolve()
        await response
        await api.application.close()
      }
    },
  )

  it.each(['context', 'resolve'] as const)(
    'WebSocketの%s中にcompleteしても実処理の完了前にoperationとProviderを解放しない',
    async (phase) => {
      const started = deferred<Context>()
      const gate = deferred<void>()
      const wait = async (context: Context) => {
        started.resolve(context)
        await gate.promise
        expect(context.resource.destroyed).toBe(false)
      }
      const api = await fixture(
        phase === 'context'
          ? { context: wait }
          : {
              resolve: async (context) => {
                await wait(context)
                return '完了'
              },
            },
      )
      try {
        const connection = await api.open()
        connection.send({ type: 'connection_init' })
        await connection.wait('connection_ack')
        connection.send({
          type: 'subscribe',
          id: '1',
          payload: { query: '{ready}' },
        })
        const context = await started.promise
        connection.send({ type: 'complete', id: '1' })
        await expect(api.application.close()).rejects.toMatchObject({
          safeCleanupBoundaryReached: false,
        })
        expect(context.signal.aborted).toBe(true)
        expect(api.completedOperations).not.toContain('graphql.operation')
        expect(api.events).not.toContain('provider.destroy')
        gate.resolve()
        await api.application.close()
        expect(
          api.completedOperations.filter(
            (kind) => kind === 'graphql.operation',
          ),
        ).toHaveLength(1)
      } finally {
        gate.resolve()
        await api.application.close()
      }
    },
  )

  it.each(['complete', 'disconnect', 'drain'] as const)(
    '%sでreturnが先に完了しても未完了のnextが残る間はProviderを保持する',
    async (mode) => {
      const started = deferred<Context>()
      const gate = deferred<void>()
      const returned = vi.fn(async () => ({
        done: true as const,
        value: undefined,
      }))
      const api = await fixture({
        subscribe: (context) => ({
          [Symbol.asyncIterator]() {
            return {
              async next() {
                started.resolve(context)
                await gate.promise
                expect(context.resource.destroyed).toBe(false)
                return { done: true as const, value: undefined }
              },
              return: returned,
            }
          },
        }),
      })
      try {
        const connection = await api.open()
        connection.send({ type: 'connection_init' })
        await connection.wait('connection_ack')
        connection.send({
          type: 'subscribe',
          id: '1',
          payload: { query: 'subscription{values{child}}' },
        })
        const context = await started.promise
        if (mode === 'complete') connection.send({ type: 'complete', id: '1' })
        if (mode === 'disconnect') connection.disconnect()
        await expect(api.application.close()).rejects.toMatchObject({
          safeCleanupBoundaryReached: false,
        })
        expect(context.signal.aborted).toBe(true)
        expect(returned).toHaveBeenCalledTimes(1)
        expect(api.events).not.toContain('provider.destroy')
        gate.resolve()
        await api.application.close()
        expect(returned).toHaveBeenCalledTimes(1)
        expect(api.events).toEqual(['connection.close', 'provider.destroy'])
      } finally {
        gate.resolve()
        await api.application.close()
      }
    },
  )

  it('Subscriptionのcleanupがdone falseを返し続けても終了期限で制御を返し、後から完了できる', async () => {
    const pending = deferred<IteratorResult<unknown>>()
    let first = true
    let cleaning = false
    let canFinish = false
    const api = await fixture({
      subscribe: () => ({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (cleaning)
                return canFinish
                  ? { done: true as const, value: undefined }
                  : { done: false as const, value: [] }
              if (first) {
                first = false
                return { done: false as const, value: [{}] }
              }
              return pending.promise
            },
            async return() {
              cleaning = true
              pending.resolve({ done: false, value: [] })
              return { done: false as const, value: [] }
            },
          }
        },
      }),
    })
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      connection.send({
        type: 'subscribe',
        id: '1',
        payload: { query: 'subscription{values{child}}' },
      })
      await connection.wait('next')
      await expect(api.application.close()).rejects.toMatchObject({
        safeCleanupBoundaryReached: false,
      })
      expect(api.events).not.toContain('provider.destroy')
      canFinish = true
      await api.application.close()
      expect(api.events).toEqual(['connection.close', 'provider.destroy'])
    } finally {
      canFinish = true
      pending.resolve({ done: true, value: undefined })
      await api.application.close()
    }
  })

  it('Subscriptionのreturnがdone falseならcleanupを最後まで進める', async () => {
    const cleaned = vi.fn()
    const manifest = bindManifest({
      schemaDocument: parse(
        'type Query { ready: String } type Subscription { value: String }',
      ),
      resolvers: {
        Query: { ready: () => '完了' },
        Subscription: {
          value: {
            subscribe: async function* () {
              try {
                yield '配送'
              } finally {
                yield 'cleanup'
                cleaned()
              }
            },
            resolve: ({ parent }: { parent: unknown }) => parent,
          },
        },
      },
    })
    const bound = getManifest(manifest)
    const controller = new AbortController()
    const stream = await subscribeManifest(
      bound,
      {
        schema: bound.schema,
        document: parse('subscription{value}'),
        contextValue: {},
      },
      { signal: controller.signal },
    )
    if (!(Symbol.asyncIterator in stream))
      throw new Error('Subscription streamが必要です。')
    await stream.next()
    await stream.return?.()
    expect(cleaned).toHaveBeenCalledTimes(1)
  })
})
