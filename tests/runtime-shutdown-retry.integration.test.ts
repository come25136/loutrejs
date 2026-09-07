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
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
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

  it('Deno adapterはsafe boundary到達失敗後のcloseをKernelへ再試行する', async () => {
    vi.stubGlobal('Deno', {
      env: { get: () => undefined, toObject: () => ({}) },
      version: { deno: 'test' },
    })
    const fixture = retryableShutdownFixture()
    const application = await denoRuntime.create({
      application: fixture.definition,
      forceShutdownTimeoutMs: 1,
    })
    fixture.start(application)

    await expect(application.close()).rejects.toThrow(
      'Deno runtime shutdown failed',
    )
    expect(fixture.events).toEqual(['extension.drain'])

    fixture.complete()
    await expect(application.close()).rejects.toThrow(
      'Deno runtime shutdown failed',
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
    name: '@fixture/runtime-shutdown-retry',
    compile: (definition) => ({
      kind: 'execution',
      id: definition.id,
      executionKind: 'fixture.runtime-shutdown-retry',
      dependencies: [],
      capabilities: [],
      compiled: {},
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
