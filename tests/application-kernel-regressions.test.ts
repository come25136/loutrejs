import { describe, expect, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionDefinition,
  type ExecutionLease,
} from '@loutrejs/loutre'

interface BrokenHostDefinition extends ExecutionDefinition {
  readonly id: string
}

describe('Application Kernel regression', () => {
  it('Host API生成失敗時にExtensionとProviderをrollbackする', async () => {
    const events: string[] = []
    const extension = defineExecutionExtension<
      BrokenHostDefinition,
      Record<never, never>,
      'broken',
      { readonly value: string }
    >({
      kind: 'execution-extension',
      abiVersion: '1',
      name: '@fixture/broken-host',
      compile: (definition) => ({
        kind: 'execution',
        id: definition.id,
        executionKind: 'fixture.broken-host',
        dependencies: [],
        capabilities: [],
        compiled: {},
      }),
      createRuntime: () => ({
        drain() {
          events.push('extension.drain')
        },
        close() {
          events.push('extension.close')
        },
      }),
      host: {
        namespace: 'broken',
        create() {
          throw new Error('host creation failed')
        },
      },
    })

    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }

    const execution = defineExecution(extension, { id: 'broken.host' })
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [execution],
    }))

    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [Module()] }),
      }),
    ).rejects.toThrow('host creation failed')

    expect(events).toEqual([
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
  })

  it('drain失敗時はactive executionをabortしてclose・Provider cleanupまで到達する', async () => {
    const events: string[] = []
    const drainError = new Error('drain failed')
    let activeLease: ExecutionLease | undefined
    const extension = defineExecutionExtension<
      any,
      {},
      'fixture',
      {
        start(): AbortSignal
      }
    >({
      kind: 'execution-extension',
      abiVersion: '1',
      name: '@fixture/drain-failure',
      compile: () => ({
        kind: 'execution',
        id: 'fixture.drain-failure',
        executionKind: 'fixture.drain-failure',
        dependencies: [],
        capabilities: [],
        compiled: {},
      }),
      createRuntime: ({ applicationRuntime }) => ({
        start() {
          const lease = applicationRuntime.beginExecution()
          activeLease = lease
          lease.signal.addEventListener('abort', () => lease.complete(), {
            once: true,
          })
          return lease.signal
        },
        drain() {
          events.push('extension.drain')
          throw drainError
        },
        close() {
          events.push('extension.close')
        },
      }),
      host: {
        namespace: 'fixture',
        create: ({ runtime }) => ({
          start: () => (runtime as { start(): AbortSignal }).start(),
        }),
      },
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [defineExecution(extension, {})],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    const signal = application.fixture.start()

    let thrown: unknown
    try {
      await application.close()
    } catch (error) {
      thrown = error
    }

    expect(signal.aborted).toBe(true)
    expect(activeLease?.signal.aborted).toBe(true)
    expect(events).toEqual([
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toContain(drainError)
    await expect(application.close()).resolves.toBeUndefined()
  })

  it('drainが永久pendingでもforceShutdownTimeoutMsでabortしてsafe boundaryへ進む', async () => {
    const events: string[] = []
    let activeLease: ExecutionLease | undefined
    const extension = defineExecutionExtension<
      any,
      {},
      'fixture',
      { start(): AbortSignal }
    >({
      kind: 'execution-extension',
      abiVersion: '1',
      name: '@fixture/hanging-drain',
      compile: () => ({
        kind: 'execution',
        id: 'fixture.hanging-drain',
        executionKind: 'fixture.hanging-drain',
        dependencies: [],
        capabilities: [],
        compiled: {},
      }),
      createRuntime: ({ applicationRuntime }) => ({
        start() {
          const lease = applicationRuntime.beginExecution()
          activeLease = lease
          lease.signal.addEventListener('abort', () => lease.complete(), {
            once: true,
          })
          return lease.signal
        },
        drain() {
          events.push('extension.drain')
          return new Promise<void>(() => undefined)
        },
        close() {
          events.push('extension.close')
        },
      }),
      host: {
        namespace: 'fixture',
        create: ({ runtime }) => ({
          start: () => (runtime as { start(): AbortSignal }).start(),
        }),
      },
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [defineExecution(extension, {})],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const signal = application.fixture.start()

    const close = Promise.race([
      application.close(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('shutdown hung')), 100),
      ),
    ])

    await expect(close).rejects.toThrow('Application shutdown failed.')
    expect(signal.aborted).toBe(true)
    expect(activeLease?.signal.aborted).toBe(true)
    expect(events).toEqual([
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
  })

  it('drain失敗後もactive executionが残る間はProviderをcleanupしない', async () => {
    const events: string[] = []
    let activeLease: ExecutionLease | undefined
    const extension = defineExecutionExtension<
      any,
      {},
      'fixture',
      { start(): void }
    >({
      kind: 'execution-extension',
      abiVersion: '1',
      name: '@fixture/uncooperative-drain-failure',
      compile: () => ({
        kind: 'execution',
        id: 'fixture.uncooperative-drain-failure',
        executionKind: 'fixture.uncooperative-drain-failure',
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
        namespace: 'fixture',
        create: ({ runtime }) => ({
          start: () => (runtime as { start(): void }).start(),
        }),
      },
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [defineExecution(extension, {})],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 5,
    })
    application.fixture.start()

    await expect(application.close()).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(activeLease?.signal.aborted).toBe(true)
    expect(events).toEqual(['extension.drain'])

    activeLease?.complete()
    await expect(application.close()).rejects.toThrow(
      'Application shutdown failed.',
    )
    expect(events).toEqual([
      'extension.drain',
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
  })

  it('initialization rollbackで未初期化ProviderをLifecycle hook注入から生成しない', async () => {
    let constructed = 0
    class UninitializedProvider {
      constructor() {
        constructed += 1
      }
    }
    class BrokenProvider {
      onModuleInit() {
        throw new Error('initialization failed')
      }
    }
    const Module = defineModule(() => ({
      providers: [BrokenProvider, UninitializedProvider],
      lifecycle: {
        onModuleDestroy: {
          kind: 'lifecycle-hook' as const,
          inject: [UninitializedProvider],
          run: () => undefined,
        },
      },
    }))
    const definition = defineApplication({ modules: [Module()] })
    constructed = 0

    await expect(
      bootstrapApplication({ application: definition }),
    ).rejects.toThrow('initialization failed')
    expect(constructed).toBe(0)
  })
})
