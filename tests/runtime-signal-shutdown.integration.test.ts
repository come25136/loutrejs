import {
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionLease,
} from '@loutrejs/loutre'
import { Logger, type LogRecord } from '@loutrejs/loutre/runtime'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { nodeRuntime } from '@loutrejs/node'

const signals = ['SIGINT', 'SIGTERM'] as const
const listenerCounts = () =>
  signals.map((signal) => process.listenerCount(signal))

describe.each([
  ['Node', nodeRuntime],
  ['Bun', bunRuntime],
] as const)('%sのsignal shutdown継続', (name, runtime) => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    if (name === 'Bun') vi.stubGlobal('Bun', { env: {}, version: '1.4.0' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('実行中のjobがなくてもpending drainの完了後に自動cleanupする', async () => {
    const fixture = workerFixture(true)
    const baseline = listenerCounts()
    const previousHandlers = process.rawListeners('SIGINT')
    const app = await runtime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 5,
    })
    try {
      const handler = process
        .rawListeners('SIGINT')
        .find((candidate) => !previousHandlers.includes(candidate))!
      Reflect.apply(handler, process, [])
      await vi.waitFor(() => expect(fixture.records).toHaveLength(1))
      expect(fixture.events).toEqual(['extension.drain'])
      fixture.finishDrain()
      await vi.waitFor(() =>
        expect(fixture.events).toContain('provider.shutdown:SIGINT'),
      )
      expect(fixture.events).toEqual([
        'extension.drain',
        'extension.close',
        'provider.destroy',
        'provider.shutdown:SIGINT',
      ])
      expect(listenerCounts()).toEqual(baseline)
    } finally {
      fixture.finishDrain()
      await app.close().catch(() => {})
    }
  })

  it.each([
    'execution',
    'drain-first',
    'execution-first',
    'drain-reject',
  ] as const)(
    '%s: timeout後に実行とdrainが完了すれば手動closeなしでcleanupする',
    async (order) => {
      const fixture = workerFixture(order !== 'execution')
      const baseline = listenerCounts()
      const previousHandlers = process.rawListeners('SIGTERM')
      const app = await runtime.create({
        application: fixture.definition,
        forceShutdownTimeoutMs: 5,
      })
      app.worker.start()
      try {
        const handler = process
          .rawListeners('SIGTERM')
          .find((candidate) => !previousHandlers.includes(candidate))!
        Reflect.apply(handler, process, [])
        await vi.waitFor(() => expect(fixture.records).toHaveLength(1))
        expect(fixture.events).toEqual(['extension.drain'])
        expect(listenerCounts()).toEqual(baseline)
        await expect(app.serve({ port: 0 })).rejects.toThrow(
          'LUTRE_APP_STOPPED',
        )

        if (order === 'drain-first') {
          fixture.finishDrain()
          await new Promise<void>((resolve) => setImmediate(resolve))
          expect(fixture.events).toEqual(['extension.drain'])
        }
        fixture.finishExecution()
        if (order === 'execution-first' || order === 'drain-reject') {
          await new Promise<void>((resolve) => setImmediate(resolve))
          expect(fixture.events).toEqual([
            'extension.drain',
            'execution.complete',
          ])
          fixture.finishDrain(
            order === 'drain-reject' ? new Error('drain failed') : undefined,
          )
        }

        await vi.waitFor(() =>
          expect(fixture.events).toContain('provider.shutdown:SIGTERM'),
        )
        expect(fixture.events).toEqual([
          'extension.drain',
          'execution.complete',
          ...(order === 'drain-reject' ? ['extension.drain'] : []),
          'extension.close',
          'provider.destroy',
          'provider.shutdown:SIGTERM',
        ])
        expect(listenerCounts()).toEqual(baseline)
        if (order === 'drain-reject') {
          await vi.waitFor(() => expect(fixture.records).toHaveLength(2))
          expect(fixture.records[1]).toMatchObject({
            signal: 'SIGTERM',
            error: expect.objectContaining({
              safeCleanupBoundaryReached: true,
            }),
          })
        }
      } finally {
        fixture.finishExecution()
        fixture.finishDrain()
        await app.close().catch(() => {})
      }
    },
  )
})

function workerFixture(pendingDrain: boolean) {
  const events: string[] = []
  const records: LogRecord[] = []
  let lease: ExecutionLease | undefined
  let resolveDrain!: () => void
  let rejectDrain!: (error: Error) => void
  const drain = new Promise<void>((resolve, reject) => {
    resolveDrain = resolve
    rejectDrain = reject
  })
  class Resource {
    onModuleDestroy() {
      events.push('provider.destroy')
    }
    onApplicationShutdown(signal?: string) {
      events.push(`provider.shutdown:${signal}`)
    }
  }
  const extension = defineExecutionExtension<
    any,
    {},
    'worker',
    { start(): void }
  >({
    kind: 'execution-extension',
    abiVersion: '1',
    name: '@fixture/signal-shutdown',
    compile: () => ({
      kind: 'execution',
      id: 'fixture.signal-shutdown',
      executionKind: 'fixture.signal-shutdown',
      dependencies: [],
      capabilities: [],
      compiled: Object.freeze({}),
    }),
    createRuntime: ({ applicationRuntime }) => ({
      start() {
        lease = applicationRuntime.beginExecution()
      },
      drain() {
        events.push('extension.drain')
        if (pendingDrain) return drain
      },
      close() {
        events.push('extension.close')
      },
    }),
    host: {
      namespace: 'worker',
      create: ({ runtime }) => ({
        start: () => (runtime as { start(): void }).start(),
      }),
    },
  })
  return {
    definition: defineApplication({
      modules: [
        defineModule({
          providers: [Resource],
          executions: [defineExecution(extension, {})],
        }),
      ],
      logger: new Logger({ write: (record) => records.push(record) }),
    }),
    events,
    records,
    finishExecution() {
      if (!lease) return
      events.push('execution.complete')
      lease.complete()
      lease = undefined
    },
    finishDrain(error?: Error) {
      if (error) rejectDrain(error)
      else resolveDrain()
    },
  }
}
