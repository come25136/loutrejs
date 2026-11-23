import { nodeRuntime } from '@loutrejs/node'
import {
  application,
  defineExecution,
  defineExecutionExtension,
  module,
  type ExecutionDefinition,
  type ExecutionLease,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { silentLoggingModule } from './helpers/silent-logger.js'

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
    const app = await nodeRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    fixture.start(app)

    const firstClose = app.close()
    expect(app.close()).toBe(firstClose)
    await expect(firstClose).rejects.toThrow('Node runtime shutdown failed')
    expect(fixture.events).toEqual(['extension.drain'])

    fixture.complete()
    await expect(app.close()).rejects.toThrow('Node runtime shutdown failed')
    expect(fixture.events).toEqual([
      'extension.drain',
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
    await expect(app.close()).resolves.toBeUndefined()
  })

  it('Nodeはsafe boundary未到達時にnative closeを無期限に待たず、再serveも拒否する', async () => {
    const fixture = retryableShutdownFixture()
    const app = await nodeRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    const listener = await app.serve({ port: 0, shutdownHooks: false })
    const originalClose = listener.server.close.bind(listener.server)
    let completeNativeClose: (() => void) | undefined
    listener.server.close = ((callback?: (error?: Error) => void) =>
      originalClose((error) => {
        completeNativeClose = () => callback?.(error)
      })) as typeof listener.server.close
    fixture.start(app)
    try {
      await expect(app.close()).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ safeCleanupBoundaryReached: false }),
        ],
      })
      expect(fixture.events).toEqual(['extension.drain'])
      await expect(app.serve({ port: 0 })).rejects.toThrow('LUTRE_APP_STOPPED')
      await vi.waitFor(() => expect(completeNativeClose).toBeDefined())
      completeNativeClose!()
      fixture.complete()
      await expect(app.close()).rejects.toThrow('Node runtime shutdown failed')
      await app.close()
      expect(fixture.events).toContain('provider.destroy')
    } finally {
      completeNativeClose?.()
      fixture.complete()
      await app.close().catch(() => {})
      await app.close()
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
      version: '1.4.0',
      serve: () => ({ port: 43210, stop }),
    })
    const fixture = retryableShutdownFixture()
    const app = await bunRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    await app.serve({ port: 0, shutdownHooks: false })
    fixture.start(app)
    try {
      await expect(app.close()).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ safeCleanupBoundaryReached: false }),
        ],
      })
      expect(stop).toHaveBeenCalledExactlyOnceWith(false)
      expect(fixture.events).toEqual(['extension.drain'])
      await expect(app.serve({ port: 0 })).rejects.toThrow('LUTRE_APP_STOPPED')
      completeNativeStop!()
      fixture.complete()
      await expect(app.close()).rejects.toThrow('Bun runtime shutdown failed')
      await app.close()
      expect(stop).toHaveBeenCalledExactlyOnceWith(false)
      expect(fixture.events).toContain('provider.destroy')
    } finally {
      completeNativeStop?.()
      fixture.complete()
      await app.close().catch(() => {})
      await app.close()
    }
  })

  it('Node adapterはserver closeの一時失敗後にcloseを再試行する', async () => {
    const app = await nodeRuntime.create({
      application: httpOnlyDefinition(),
    })
    const listener = await app.serve({
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

    await expect(app.close()).rejects.toThrow('Node runtime shutdown failed')
    await expect(app.close()).resolves.toBeUndefined()
    expect(closeAttempts).toBe(2)
  })

  it('Bun adapterはsafe boundary到達失敗後のcloseをKernelへ再試行する', async () => {
    vi.stubGlobal('Bun', { env: {}, version: '1.4.0' })
    const fixture = retryableShutdownFixture()
    const app = await bunRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    fixture.start(app)

    await expect(app.close()).rejects.toThrow('Bun runtime shutdown failed')
    expect(fixture.events).toEqual(['extension.drain'])

    fixture.complete()
    await expect(app.close()).rejects.toThrow('Bun runtime shutdown failed')
    expect(fixture.events).toEqual([
      'extension.drain',
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
    await expect(app.close()).resolves.toBeUndefined()
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
    factory: () => ({ health: () => ({ schema: contract.health.ok }) }),
  })
  const Module = module(() => ({ executions: [controller] }))
  return application({
    modules: [silentLoggingModule, Module()],
  })
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
    factory: () => ({ health: () => ({ schema: contract.health.ok }) }),
  })
  class Resource {
    onModuleDestroy() {
      events.push('provider.destroy')
    }
  }
  const Module = module(() => ({
    providers: [Resource],
    executions: [
      controller,
      defineExecution(blockingExtension, { id: 'blocking.execution' }),
    ],
  }))
  const definition = application({
    modules: [silentLoggingModule, Module()],
  })

  return {
    definition,
    events,
    start(app: { readonly blocking: { start(): void } }) {
      app.blocking.start()
    },
    complete() {
      activeLease?.complete()
    },
  }
}
