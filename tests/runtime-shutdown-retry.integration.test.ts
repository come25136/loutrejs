import { nodeRuntime } from '@loutrejs/node'
import {
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionDefinition,
  type ExecutionLease,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { silentLogger } from './helpers/silent-logger.js'

describe('runtime shutdown retry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('Node adapterはsafe boundary到達失敗後のcloseをKernelへ再試行する', async () => {
    const fixture = retryableShutdownFixture()
    const application = await nodeRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    fixture.start(application)

    const firstClose = application.close()
    expect(application.close()).toBe(firstClose)
    await expect(firstClose).rejects.toThrow('Node runtime shutdown failed')
    expect(fixture.events).toEqual(['extension.drain'])

    fixture.complete()
    await expect(application.close()).rejects.toThrow(
      'Node runtime shutdown failed',
    )
    expect(fixture.events).toEqual([
      'extension.drain',
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
    await expect(application.close()).resolves.toBeUndefined()
  })

  it('Nodeはsafe boundary未到達時にnative closeを無期限に待たず、再serveも拒否する', async () => {
    const fixture = retryableShutdownFixture()
    const application = await nodeRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    const listener = await application.serve({ port: 0, shutdownHooks: false })
    const originalClose = listener.server.close.bind(listener.server)
    let completeNativeClose: (() => void) | undefined
    listener.server.close = ((callback?: (error?: Error) => void) =>
      originalClose((error) => {
        completeNativeClose = () => callback?.(error)
      })) as typeof listener.server.close
    fixture.start(application)
    try {
      await expect(application.close()).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ safeCleanupBoundaryReached: false }),
        ],
      })
      expect(fixture.events).toEqual(['extension.drain'])
      await expect(application.serve({ port: 0 })).rejects.toThrow(
        'LUTRE_APP_STOPPED',
      )
      await vi.waitFor(() => expect(completeNativeClose).toBeDefined())
      completeNativeClose!()
      fixture.complete()
      await expect(application.close()).rejects.toThrow(
        'Node runtime shutdown failed',
      )
      await application.close()
      expect(fixture.events).toContain('provider.destroy')
    } finally {
      completeNativeClose?.()
      fixture.complete()
      await application.close().catch(() => {})
      await application.close()
    }
  })

  it('Bunはdraining中に受付だけを止め、safe boundary到達前に強制stopしない', async () => {
    let completeNativeStop: (() => void) | undefined
    const pendingStop = new Promise<void>((resolve) => {
      completeNativeStop = resolve
    })
    const stop = vi.fn(() => pendingStop)
    vi.stubGlobal('Bun', {
      env: {},
      version: 'test',
      serve: () => ({ port: 43210, stop }),
    })
    const fixture = retryableShutdownFixture()
    const application = await bunRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    await application.serve({ port: 0, shutdownHooks: false })
    fixture.start(application)
    try {
      await expect(application.close()).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ safeCleanupBoundaryReached: false }),
        ],
      })
      expect(stop).toHaveBeenCalledExactlyOnceWith(false)
      expect(fixture.events).toEqual(['extension.drain'])
      await expect(application.serve({ port: 0 })).rejects.toThrow(
        'LUTRE_APP_STOPPED',
      )
      completeNativeStop!()
      fixture.complete()
      await expect(application.close()).rejects.toThrow(
        'Bun runtime shutdown failed',
      )
      await application.close()
      expect(stop).toHaveBeenCalledExactlyOnceWith(false)
      expect(fixture.events).toContain('provider.destroy')
    } finally {
      completeNativeStop?.()
      fixture.complete()
      await application.close().catch(() => {})
      await application.close()
    }
  })

  it('Node adapterはserver closeの一時失敗後にcloseを再試行する', async () => {
    const application = await nodeRuntime.create({
      application: httpOnlyDefinition(),
    })
    const listener = await application.serve({
      port: 0,
      shutdownHooks: false,
    })
    const closeServer = listener.server.close.bind(listener.server)
    let closeAttempts = 0
    listener.server.close = ((callback?: (error?: Error) => void) => {
      closeAttempts += 1
      if (closeAttempts === 1) {
        callback?.(new Error('server close failed'))
        return listener.server
      }
      return closeServer(callback)
    }) as typeof listener.server.close

    await expect(application.close()).rejects.toThrow(
      'Node runtime shutdown failed',
    )
    await expect(application.close()).resolves.toBeUndefined()
    expect(closeAttempts).toBe(2)
  })

  it('Bun adapterはsafe boundary到達失敗後のcloseをKernelへ再試行する', async () => {
    vi.stubGlobal('Bun', { env: {}, version: 'test' })
    const fixture = retryableShutdownFixture()
    const application = await bunRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    fixture.start(application)

    await expect(application.close()).rejects.toThrow(
      'Bun runtime shutdown failed',
    )
    expect(fixture.events).toEqual(['extension.drain'])

    fixture.complete()
    await expect(application.close()).rejects.toThrow(
      'Bun runtime shutdown failed',
    )
    expect(fixture.events).toEqual([
      'extension.drain',
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
    await expect(application.close()).resolves.toBeUndefined()
  })
})

function httpOnlyDefinition() {
  const contract = http.contract({
    health: {
      method: 'GET',
      path: '/health',
      responses: { ok: { status: 204 } },
    },
  })
  const controller = http.implementation({
    contract,
    factory: () => ({ health: (context) => context.response.ok({}) }),
  })
  const Module = defineModule(() => ({ executions: [controller] }))
  return defineApplication({ modules: [Module()], logger: silentLogger })
}

function retryableShutdownFixture() {
  const events: string[] = []
  let activeLease: ExecutionLease | undefined
  interface BlockingExecution extends ExecutionDefinition {
    readonly id: string
  }
  const blockingExtension = defineExecutionExtension<
    BlockingExecution,
    Record<never, never>,
    'blocking',
    { start(): void }
  >({
    kind: 'execution-extension',
    abiVersion: '1',
    name: '@fixture/runtime-shutdown-retry',
    compile: (definition) => ({
      kind: 'execution',
      id: definition.id,
      executionKind: 'fixture.runtime-shutdown-retry',
      dependencies: [],
      capabilities: [],
      compiled: Object.freeze({}),
    }),
    createRuntime: ({ applicationRuntime }) => ({
      start() {
        activeLease = applicationRuntime.beginExecution()
      },
      drain() {
        events.push('extension.drain')
        throw new Error('drain failed')
      },
      close() {
        events.push('extension.close')
      },
    }),
    host: {
      namespace: 'blocking',
      create: ({ runtime }) => ({
        start: () => (runtime as { start(): void }).start(),
      }),
    },
  })
  const contract = http.contract({
    health: {
      method: 'GET',
      path: '/health',
      responses: { ok: { status: 204 } },
    },
  })
  const controller = http.implementation({
    contract,
    factory: () => ({ health: (context) => context.response.ok({}) }),
  })
  class Resource {
    onModuleDestroy() {
      events.push('provider.destroy')
    }
  }
  const Module = defineModule(() => ({
    providers: [Resource],
    executions: [
      controller,
      defineExecution(blockingExtension, { id: 'blocking.execution' }),
    ],
  }))
  const definition = defineApplication({
    modules: [Module()],
    logger: silentLogger,
  })

  return {
    definition,
    events,
    start(application: { readonly blocking: { start(): void } }) {
      application.blocking.start()
    },
    complete() {
      activeLease?.complete()
    },
  }
}
