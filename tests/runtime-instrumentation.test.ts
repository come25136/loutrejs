import {
  defineApplication,
  defineModule,
  provide,
  token,
  type RuntimeInstrumentation,
} from '@loutrejs/loutre'
import { ApplicationKernelRuntime } from '@loutrejs/loutre/runtime'

describe('Runtime instrumentation boundary', () => {
  it('coreはexecution/operation/providerの意味情報だけをgeneric instrumentationへ渡す', async () => {
    class Repository {
      read() {
        return 42
      }
    }

    const application = defineApplication({
      modules: [defineModule(() => ({ providers: [Repository] }))()],
    })
    const calls: string[] = []
    let executionInvocation: unknown
    let operationInvocation: unknown
    const instrumentation: RuntimeInstrumentation = {
      providerCreated(metadata, value) {
        calls.push(
          `provider:${metadata.name}:${metadata.scope}:${metadata.providerKind}`,
        )
        expect(value).toBeInstanceOf(Repository)
      },
      beginExecution(metadata, invocation) {
        calls.push(`execution:${metadata.executionKind}:${metadata.name}`)
        executionInvocation = invocation
        return {
          run(operation) {
            calls.push('execution:run')
            return operation()
          },
          complete(result) {
            calls.push(`execution:complete:${String(result)}`)
          },
        }
      },
      beginOperation(metadata, invocation) {
        calls.push(`operation:${metadata.kind}:${metadata.name}`)
        operationInvocation = invocation
        return {
          run(operation) {
            calls.push('operation:run')
            return operation()
          },
          complete(result) {
            calls.push(`operation:complete:${String(result)}`)
          },
        }
      },
      close() {
        calls.push('close')
      },
    }
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation,
    })
    await runtime.initialize()

    const execution = runtime.beginExecution(
      {
        executionId: 'task:demo',
        executionKind: 'task.invocation',
        graphNodeId: 'task:demo',
        name: 'demo',
      },
      {
        input: { value: 21 },
        invoke: (input) => input,
      },
    )
    const result = execution.run!(() => {
      const operation = runtime.beginOperation(
        {
          kind: 'http.handler',
          name: 'demo.handler',
          graphNodeId: 'task:demo',
        },
        {
          input: { value: 21 },
          invoke: (input) => input,
        },
      )
      const value = operation.run!(() => 42)
      operation.complete(value)
      return value
    })
    execution.complete(result)
    await runtime.shutdown()

    expect(executionInvocation).toMatchObject({ input: { value: 21 } })
    expect(operationInvocation).toMatchObject({ input: { value: 21 } })
    expect(calls).toEqual([
      'provider:Repository:application:class',
      'execution:task.invocation:demo',
      'execution:run',
      'operation:http.handler:demo.handler',
      'operation:run',
      'operation:complete:42',
      'execution:complete:42',
      'close',
    ])
  })

  it('useValue providerもproviderCreatedへ通知する', async () => {
    const Service = token<{ ping(): string }>('runtime-instrumentation-value')
    const service = { ping: () => 'pong' }
    const application = defineApplication({
      modules: [
        defineModule(() => ({
          providers: [provide(Service).useValue(service)],
        }))(),
      ],
    })
    const created: unknown[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: {
        providerCreated(_metadata, value) {
          created.push(value)
        },
      },
    })

    await runtime.initialize()
    expect(runtime.get(Service)).toBe(service)
    expect(created).toEqual([service])
    await runtime.shutdown()
  })

  it('instrumentationの例外はDI/execution/shutdown semanticsへ影響しない', async () => {
    class Repository {
      read() {
        return 42
      }
    }
    const application = defineApplication({
      modules: [defineModule(() => ({ providers: [Repository] }))()],
    })
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: {
        providerCreated() {
          throw new Error('provider instrumentation failed')
        },
        beginExecution() {
          throw new Error('execution instrumentation failed')
        },
        beginOperation() {
          throw new Error('operation instrumentation failed')
        },
        close() {
          throw new Error('instrumentation close failed')
        },
      },
    })

    await expect(runtime.initialize()).resolves.toBeUndefined()
    expect(runtime.get(Repository).read()).toBe(42)

    const execution = runtime.beginExecution({
      executionId: 'safe',
      executionKind: 'custom',
    })
    expect(execution.run).toBeUndefined()
    execution.complete()

    const operation = runtime.beginOperation({ kind: 'custom', name: 'safe' })
    expect(operation.run!(() => 42)).toBe(42)
    operation.complete()

    await expect(runtime.shutdown()).resolves.toBeUndefined()
  })

  it('初期化rollbackでもinstrumentationをcloseする', async () => {
    class BrokenProvider {
      onModuleInit() {
        throw new Error('init failed')
      }
    }
    const application = defineApplication({
      modules: [defineModule(() => ({ providers: [BrokenProvider] }))()],
    })
    let closeCount = 0
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: {
        close() {
          closeCount += 1
        },
      },
    })

    await expect(runtime.initialize()).rejects.toThrow('init failed')
    expect(closeCount).toBe(1)
    await expect(runtime.shutdown()).resolves.toBeUndefined()
    expect(closeCount).toBe(1)
  })
})
