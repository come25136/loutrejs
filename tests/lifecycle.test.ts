import {
  buildApplicationModel,
  createKernelApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'

describe('Application Lifecycle', () => {
  it('初期化失敗時は対象instanceのonModuleDestroyだけを逆順で実行する', async () => {
    const events: string[] = []
    const failure = new Error('B init failure')
    class ProviderA {
      async onModuleInit() {
        await Promise.resolve()
        events.push('A.init')
      }
      onModuleDestroy() {
        events.push('A.destroy')
      }
      beforeApplicationShutdown() {
        events.push('A.before')
      }
      onApplicationShutdown() {
        events.push('A.shutdown')
      }
    }
    class ProviderB {
      onModuleInit() {
        events.push('B.init')
        throw failure
      }
      onModuleDestroy() {
        events.push('B.destroy')
      }
    }
    const Module = defineModule(() => ({ providers: [ProviderA, ProviderB] }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    await expect(application.init()).rejects.toBe(failure)
    expect(events).toEqual(['A.init', 'B.init', 'B.destroy', 'A.destroy'])
    await expect(application.init()).rejects.toThrow('LUTRE_APPLICATION_STATE')
  })

  it('初期化errorとcleanup errorをoriginal先頭のAggregateErrorにする', async () => {
    const initializationError = new Error('initialization')
    const cleanupError = new Error('cleanup')
    class Provider {
      onModuleInit() {
        throw initializationError
      }
      onModuleDestroy() {
        throw cleanupError
      }
    }
    const Module = defineModule(() => ({ providers: [Provider] }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    let thrown: unknown
    try {
      await application.init()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      initializationError,
      cleanupError,
    ])
  })

  it('ProviderのDisposable protocolはLifecycleとして自動実行しない', async () => {
    const events: string[] = []
    class Provider {
      onModuleDestroy() {
        events.push('destroy')
      }
      [Symbol.asyncDispose]() {
        events.push('dispose')
        return Promise.resolve()
      }
    }
    const Module = defineModule(() => ({ providers: [Provider] }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    await application.init()
    await application.close()
    expect(events).toEqual(['destroy'])
  })

  it('shutdownはcleanup失敗後も続け、最後にAggregateErrorを投げる', async () => {
    const events: string[] = []
    const firstError = new Error('first cleanup')
    const secondError = new Error('second cleanup')
    class First {
      onModuleDestroy() {
        events.push('first')
        throw firstError
      }
    }
    class Second {
      onModuleDestroy() {
        events.push('second')
        throw secondError
      }
    }
    const Module = defineModule(() => ({ providers: [First, Second] }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    await application.init()

    let thrown: unknown
    try {
      await application.close()
    } catch (error) {
      thrown = error
    }
    expect(events).toEqual(['second', 'first'])
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([secondError, firstError])
    await expect(application.close()).resolves.toBeUndefined()
  })

  it('shutdown lifecycleをonModuleDestroyから既存順序で実行する', async () => {
    const events: string[] = []
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
      beforeApplicationShutdown(signal?: string) {
        events.push(`provider.before:${signal}`)
      }
      onApplicationShutdown(signal?: string) {
        events.push(`provider.shutdown:${signal}`)
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      lifecycle: {
        onModuleDestroy: {
          kind: 'lifecycle-hook' as const,
          inject: [],
          run: () => {
            events.push('module.destroy')
          },
        },
        beforeApplicationShutdown: {
          kind: 'lifecycle-hook' as const,
          inject: [],
          run: () => {
            events.push('module.before')
          },
        },
        onApplicationShutdown: {
          kind: 'lifecycle-hook' as const,
          inject: [],
          run: () => {
            events.push('module.shutdown')
          },
        },
      },
    }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    await application.init()

    await application.close('SIGTERM')

    expect(events).toEqual([
      'provider.destroy',
      'module.destroy',
      'provider.before:SIGTERM',
      'module.before',
      'provider.shutdown:SIGTERM',
      'module.shutdown',
    ])
  })

  it('Application Model構築ではLifecycleを実行しない', () => {
    let initialized = false
    let destroyed = false
    class Resource {
      onModuleInit() {
        initialized = true
      }
      onModuleDestroy() {
        destroyed = true
      }
    }
    const Module = defineModule(() => ({ providers: [Resource] }))

    expect(buildApplicationModel({ modules: [Module()] }).diagnostics).toEqual(
      [],
    )
    expect(initialized).toBe(false)
    expect(destroyed).toBe(false)
  })
})
