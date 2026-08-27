import { defineModule } from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { createApplicationRuntime } from '@loutrejs/runtime'

describe('Application Lifecycle', () => {
  it('初期化失敗時に対象instanceを逆順でcleanupする', async () => {
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
    const runtime = createApplicationRuntime([Module()])

    await expect(runtime.initialize()).rejects.toBe(failure)
    expect(events).toEqual(['A.init', 'B.init', 'B.destroy', 'A.destroy'])
    await expect(runtime.initialize()).rejects.toThrow('LUTRE_APP_STOPPED')
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
    const runtime = createApplicationRuntime([Module()])

    let thrown: unknown
    try {
      await runtime.initialize()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      initializationError,
      cleanupError,
    ])
  })

  it('shutdownはhook失敗後もcleanupを続け、最後にAggregateErrorを投げる', async () => {
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
    const runtime = createApplicationRuntime([Module()])
    await runtime.initialize()

    let thrown: unknown
    try {
      await runtime.shutdown()
    } catch (error) {
      thrown = error
    }
    expect(events).toEqual(['second', 'first'])
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([secondError, firstError])
    await expect(runtime.shutdown()).resolves.toBeUndefined()
  })

  it('Graph ProbeではLifecycleを実行しない', () => {
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

    expect(compileApplication({ modules: [Module()] }).diagnostics).toEqual([])
    expect(initialized).toBe(false)
    expect(destroyed).toBe(false)
  })
})
