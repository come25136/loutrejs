import {
  defineApplication,
  defineModule,
  inject,
  provide,
  token,
} from '@loutrejs/loutre'
import {
  DevtoolsModule,
  devtoolsOptionsOf,
  RuntimeDevtoolsInstrumentation,
  type DevtoolsModuleOptions,
  type RuntimeDevtoolsContext,
  type RuntimeEvent,
  type RuntimeObserver,
} from '@loutrejs/loutre/devtools'
import { ApplicationKernelRuntime } from '@loutrejs/loutre/runtime'

function createTestInstrumentation(
  events: RuntimeEvent[],
  options: Readonly<DevtoolsModuleOptions> = {},
  runId = 'run_test',
): RuntimeDevtoolsInstrumentation {
  let current: RuntimeDevtoolsContext | undefined
  const observer: RuntimeObserver = {
    runId,
    executionStarted: (event) => events.push(event),
    executionEnded: (event) => events.push(event),
    spanStarted: (event) => events.push(event),
    spanEnded: (event) => events.push(event),
  }
  return new RuntimeDevtoolsInstrumentation({
    options,
    observer,
    context: {
      run(context, operation) {
        const previous = current
        current = context
        try {
          return operation()
        } finally {
          current = previous
        }
      },
      current() {
        return current
      },
    },
  })
}

describe('DevTools runtime observation', () => {
  it('DevtoolsModule optionsをApplication Modelから取得できる', () => {
    const AppModule = defineModule(() => ({
      imports: [
        DevtoolsModule({
          capture: { providerMethods: false },
          replay: { enabled: true },
        }),
      ],
    }))
    const application = defineApplication({ modules: [AppModule()] })

    expect(devtoolsOptionsOf(application.model)).toEqual({
      capture: { providerMethods: false },
      replay: { enabled: true },
    })
  })

  it('Execution rootのstart/endとerrorをobserverへ通知する', async () => {
    const application = defineApplication({
      modules: [defineModule(() => ({}))()],
    })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()

    const lease = runtime.beginExecution({
      executionId: 'task:hello',
      executionKind: 'task.invocation',
      name: 'hello',
    })
    const error = new Error('boom')
    lease.fail?.(error)
    lease.complete()

    expect(events.map((event) => event.type)).toEqual([
      'execution.started',
      'span.started',
      'span.ended',
      'execution.ended',
    ])
    expect(events.every((event) => event.runId === 'run_test')).toBe(true)
    expect(new Set(events.map((event) => event.traceId)).size).toBe(1)
    expect(events.at(-1)).toMatchObject({
      type: 'execution.ended',
      executionId: 'task:hello',
      status: 'error',
      error: { message: 'boom' },
    })

    await runtime.shutdown()
  })

  it('sub-msの親子spanでも高精度timestampとdurationが同じclockで整合する', () => {
    const events: RuntimeEvent[] = []
    const instrumentation = createTestInstrumentation(events)
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100.1)
      .mockReturnValueOnce(100.6)
      .mockReturnValueOnce(100.8)
      .mockReturnValueOnce(100.9)

    try {
      const execution = instrumentation.beginExecution({
        executionId: 'http:get-ping',
        executionKind: 'http.request',
        name: 'GET /ping',
      })
      execution.run!(() => {
        const operation = instrumentation.beginOperation!({
          kind: 'http.handler',
          name: 'DemoController.ping',
        })!
        operation.complete()
      })
      execution.complete()
    } finally {
      now.mockRestore()
    }

    const rootStart = events.find(
      (event): event is Extract<RuntimeEvent, { type: 'execution.started' }> =>
        event.type === 'execution.started',
    )!
    const handlerStart = events.find(
      (event): event is Extract<RuntimeEvent, { type: 'span.started' }> =>
        event.type === 'span.started' && event.kind === 'http.handler',
    )!
    const rootEnd = events.find(
      (event): event is Extract<RuntimeEvent, { type: 'execution.ended' }> =>
        event.type === 'execution.ended',
    )!
    const handlerEnd = events.find(
      (event): event is Extract<RuntimeEvent, { type: 'span.ended' }> =>
        event.type === 'span.ended' && event.spanId === handlerStart.spanId,
    )!

    expect(handlerStart.timestamp - rootStart.timestamp).toBeCloseTo(0.5, 6)
    expect(handlerEnd.durationMs).toBeCloseTo(0.2, 6)
    expect(rootEnd.durationMs).toBeCloseTo(0.8, 6)
    expect(handlerStart.timestamp).toBeLessThanOrEqual(
      rootStart.timestamp + rootEnd.durationMs,
    )
  })

  it('observerの例外はApplication executionを壊さない', async () => {
    const application = defineApplication({
      modules: [defineModule(() => ({}))()],
    })
    const instrumentation = createTestInstrumentation([])
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: {
        beginExecution(metadata, invocation) {
          const scope = instrumentation.beginExecution(metadata, invocation)
          return {
            ...scope,
            complete(...result) {
              scope.complete(...result)
              throw new Error('observer failed')
            },
          }
        },
      },
    })
    await runtime.initialize()

    expect(() => {
      const lease = runtime.beginExecution({
        executionId: 'test',
        executionKind: 'custom',
      })
      lease.complete()
    }).not.toThrow()

    await runtime.shutdown()
  })

  it('metadataのないExecutionTracker leaseはtraceとして公開しない', async () => {
    const application = defineApplication({
      modules: [defineModule(() => ({}))()],
    })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()

    runtime.beginExecution().complete()

    expect(events).toEqual([])
    await runtime.shutdown()
  })

  it('reason未指定のabortとundefined failureをstatusとして保持する', () => {
    const events: RuntimeEvent[] = []
    const instrumentation = createTestInstrumentation(events)

    const cancelled = instrumentation.beginExecution({
      executionId: 'cancelled',
      executionKind: 'custom',
    })
    cancelled.abort?.()
    cancelled.complete()

    const failed = instrumentation.beginExecution({
      executionId: 'failed',
      executionKind: 'custom',
    })
    failed.fail?.(undefined)
    failed.complete()

    const operationRoot = instrumentation.beginExecution({
      executionId: 'operation-root',
      executionKind: 'custom',
    })
    operationRoot.run!(() => {
      const operation = instrumentation.beginOperation!({
        kind: 'custom',
        name: 'undefined-failure',
      })!
      operation.fail?.(undefined)
      operation.complete()
    })
    operationRoot.complete()

    expect(
      events.find(
        (event) =>
          event.type === 'execution.ended' && event.executionId === 'cancelled',
      ),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      events.find(
        (event) =>
          event.type === 'execution.ended' && event.executionId === 'failed',
      ),
    ).toMatchObject({
      status: 'error',
      error: { message: 'undefined' },
    })
    const operationStart = events.find(
      (event) =>
        event.type === 'span.started' && event.name === 'undefined-failure',
    )
    expect(operationStart).toBeDefined()
    expect(
      events.find(
        (event) =>
          event.type === 'span.ended' &&
          event.spanId === operationStart?.spanId,
      ),
    ).toMatchObject({
      status: 'error',
      error: { message: 'undefined' },
    })
  })

  it('provider method wrapperはinstance/this/getter/error semanticsを維持してcapsuleを作る', async () => {
    let getterReads = 0
    const thrown = new Error('same error')
    const symbolMethod = Symbol('symbolMethod')
    class Repository {
      readonly arrow = (value: number) => value + this.base
      readonly base = 10

      get dangerousGetter() {
        getterReads += 1
        return () => 0
      }

      add(value: number) {
        return this.base + value
      }

      async asyncDouble(value: number) {
        return value * 2
      }

      fail(): never {
        throw thrown
      }

      [symbolMethod](value: number) {
        return value * 2
      }
    }

    const RepositoryModule = defineModule(() => ({ providers: [Repository] }))
    const application = defineApplication({ modules: [RepositoryModule()] })
    const events: RuntimeEvent[] = []
    const instrumentation = createTestInstrumentation(
      events,
      {},
      'run_provider',
    )
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation,
    })
    await runtime.initialize()
    const repository = runtime.get(Repository)
    const providerNode = application.model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Repository,
    )
    if (!providerNode || providerNode.kind !== 'provider') {
      throw new Error('Repository provider node was not found.')
    }

    expect(repository).toBeInstanceOf(Repository)
    await expect(
      instrumentation.providerPlayground({
        requestId: 'provider-playground',
        graphNodeId: providerNode.id,
      }),
    ).resolves.toMatchObject({
      graphNodeId: providerNode.id,
      providerName: 'Repository',
      methods: expect.arrayContaining([
        { name: 'add', arity: 1 },
        { name: 'arrow', arity: 1 },
        { name: 'asyncDouble', arity: 1 },
        { name: 'fail', arity: 0 },
      ]),
    })
    const playgroundRun = await instrumentation.invokeProviderMethod({
      requestId: 'provider-playground-run',
      graphNodeId: providerNode.id,
      method: 'add',
      args: [7],
    })
    expect(playgroundRun).toMatchObject({
      status: 'ok',
      traceId: expect.stringMatching(/^trace_/),
      result: { value: 17 },
    })
    const playgroundTrace = events.find(
      (event) =>
        event.type === 'execution.started' &&
        event.traceId === playgroundRun.traceId,
    )
    expect(playgroundTrace).toMatchObject({
      executionKind: 'provider.method',
      graphNodeId: providerNode.id,
      name: 'Repository.add',
      input: { value: [7] },
      replayable: true,
    })
    expect(playgroundTrace).toHaveProperty('capsuleId')
    if (
      !playgroundTrace ||
      playgroundTrace.type !== 'execution.started' ||
      !playgroundTrace.capsuleId
    ) {
      throw new Error('Playground trace capsule was not created.')
    }
    const playgroundReplay = await instrumentation.replayCapsule({
      requestId: 'provider-playground-replay',
      capsuleId: playgroundTrace.capsuleId,
      inputOverride: [8],
    })
    expect(playgroundReplay).toMatchObject({
      status: 'ok',
      result: { value: 18 },
    })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'execution.started',
        executionKind: 'provider.method',
        name: 'Repository.add',
        replayedFromTraceId: playgroundTrace.traceId,
        replayedFromCapsuleId: playgroundTrace.capsuleId,
      }),
    )

    expect(getterReads).toBe(0)
    const lease = runtime.beginExecution({
      executionId: 'test.execution',
      executionKind: 'custom',
    })
    const result = lease.run!(() => ({
      add: repository.add(2),
      arrow: repository.arrow(3),
      symbol: repository[symbolMethod](4),
    }))
    expect(result).toEqual({ add: 12, arrow: 13, symbol: 8 })
    await expect(lease.run!(() => repository.asyncDouble(6))).resolves.toBe(12)
    expect(getterReads).toBe(0)
    expect(() => lease.run!(() => repository.fail())).toThrow(thrown)
    lease.complete()

    const methodSpans = events.filter(
      (event): event is Extract<RuntimeEvent, { type: 'span.started' }> =>
        event.type === 'span.started' && event.kind === 'provider.method',
    )
    expect(methodSpans.map((event) => event.name)).toEqual(
      expect.arrayContaining([
        'Repository.add',
        'Repository.arrow',
        'Repository.symbolMethod',
        'Repository.fail',
      ]),
    )
    const addSpan = methodSpans.find((event) => event.name === 'Repository.add')
    expect(addSpan).toMatchObject({
      input: { value: [2] },
      replayable: true,
    })
    const addEnd = events.find(
      (event) =>
        event.type === 'span.ended' && event.spanId === addSpan?.spanId,
    )
    expect(addEnd).toMatchObject({ result: { value: 12 } })
    expect(
      methodSpans.some((event) => event.name === 'Repository.asyncDouble'),
    ).toBe(false)
    const replay = await instrumentation.replayCapsule({
      requestId: 'provider-replay',
      capsuleId: addSpan!.capsuleId!,
      inputOverride: [5],
    })
    expect(replay).toMatchObject({ status: 'ok', result: { value: 15 } })

    await runtime.shutdown()
  })

  it('provider method wrapperはnative Promiseへsettlement handlerを追加しない', async () => {
    const resolved = Promise.resolve(42)
    class Repository {
      read() {
        return resolved
      }
    }
    const Module = defineModule(() => ({ providers: [Repository] }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()
    const repository = runtime.get(Repository)
    const lease = runtime.beginExecution({
      executionId: 'promise.test',
      executionKind: 'custom',
    })
    const then = vi.spyOn(Promise.prototype, 'then')

    const returned = lease.run!(() => repository.read())

    expect(returned).toBe(resolved)
    expect(then).not.toHaveBeenCalled()
    expect(
      events.some(
        (event) =>
          event.type === 'span.started' && event.kind === 'provider.method',
      ),
    ).toBe(false)
    then.mockRestore()
    await expect(returned).resolves.toBe(42)
    lease.complete()
    await runtime.shutdown()
  })

  it('useValue providerは外部objectのmethod identityを変更しない', async () => {
    const Service = token<{ ping(): string }>('devtools.use-value')
    const service = {
      ping() {
        return 'pong'
      },
    }
    const original = service.ping
    const Module = defineModule(() => ({
      providers: [provide(Service).useValue(service)],
    }))
    const application = defineApplication({ modules: [Module()] })
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation([]),
    })

    await runtime.initialize()
    expect(runtime.get(Service)).toBe(service)
    expect(service.ping).toBe(original)
    expect(service.ping()).toBe('pong')
    await runtime.shutdown()
    expect(service.ping).toBe(original)
  })

  it('factoryが返す既存instanceはmethod identityを変更しない', async () => {
    const Service = token<{ ping(): string }>('devtools.factory-external')
    const service = {
      ping() {
        return 'pong'
      },
    }
    const original = service.ping
    const Module = defineModule(() => ({
      providers: [provide(Service).useFactory({ use: () => service })],
    }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })

    await runtime.initialize()
    expect(runtime.get(Service)).toBe(service)
    expect(service.ping).toBe(original)

    const lease = runtime.beginExecution({
      executionId: 'factory-external.test',
      executionKind: 'custom',
    })
    expect(lease.run!(() => service.ping())).toBe('pong')
    lease.complete()
    expect(
      events.filter(
        (event) =>
          event.type === 'span.started' && event.kind === 'provider.method',
      ),
    ).toHaveLength(0)

    await runtime.shutdown()
    expect(service.ping).toBe(original)
  })

  it('useValueとfactoryで共有された外部instanceはどちらのProvider経由でもwrapしない', async () => {
    const FactoryService = token<{ ping(): string }>('devtools.factory-shared')
    const ValueService = token<{ ping(): string }>('devtools.value-shared')
    const shared = {
      ping() {
        return 'pong'
      },
    }
    const original = shared.ping
    const Module = defineModule(() => ({
      providers: [
        provide(FactoryService).useFactory({ use: () => shared }),
        provide(ValueService).useValue(shared),
      ],
    }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()

    expect(runtime.get(FactoryService)).toBe(shared)
    expect(runtime.get(ValueService)).toBe(shared)
    expect(shared.ping).toBe(original)

    const lease = runtime.beginExecution({
      executionId: 'external-shared.test',
      executionKind: 'custom',
    })
    expect(lease.run!(() => shared.ping())).toBe('pong')
    lease.complete()
    expect(
      events.filter(
        (event) =>
          event.type === 'span.started' && event.kind === 'provider.method',
      ),
    ).toHaveLength(0)
    await runtime.shutdown()
    expect(shared.ping).toBe(original)
  })

  it('同一factory instanceを複数Providerで共有した場合は誤帰属を避けて自動traceしない', async () => {
    const First = token<{ ping(): string }>('devtools.shared-first')
    const Second = token<{ ping(): string }>('devtools.shared-second')
    const shared = {
      ping() {
        return 'pong'
      },
    }
    const original = shared.ping
    const Module = defineModule(() => ({
      providers: [
        provide(First).useFactory({ use: () => shared }),
        provide(Second).useFactory({ use: () => shared }),
      ],
    }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()
    const lease = runtime.beginExecution({
      executionId: 'shared-provider.test',
      executionKind: 'custom',
    })

    expect(lease.run!(() => shared.ping())).toBe('pong')
    lease.complete()
    expect(
      events.filter(
        (event) =>
          event.type === 'span.started' && event.kind === 'provider.method',
      ),
    ).toHaveLength(0)
    await runtime.shutdown()
    expect(shared.ping).toBe(original)
  })

  it('provider method wrapperはlazy thenableをassimilationせずそのまま返す', async () => {
    let thenReads = 0
    let thenCalls = 0
    const lazyThenable: Record<string, unknown> = {}
    // oxlint-disable-next-line unicorn/no-thenable -- lazy thenableを再現するregression fixture。
    Object.defineProperty(lazyThenable, 'then', {
      enumerable: true,
      get() {
        thenReads += 1
        return () => {
          thenCalls += 1
        }
      },
    })
    class Repository {
      query() {
        return lazyThenable
      }
    }
    const Module = defineModule(() => ({ providers: [Repository] }))
    const application = defineApplication({ modules: [Module()] })
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation([]),
    })
    await runtime.initialize()
    const repository = runtime.get(Repository)
    const lease = runtime.beginExecution({
      executionId: 'lazy-thenable.test',
      executionKind: 'custom',
    })

    expect(lease.run!(() => repository.query())).toBe(lazyThenable)
    lease.complete()
    await Promise.resolve()
    expect(thenReads).toBe(0)
    expect(thenCalls).toBe(0)

    await runtime.shutdown()
  })

  it('provider captureは引数のaccessorやProxy getを評価せずmethod semanticsを維持する', async () => {
    let getterReads = 0
    let proxyGets = 0
    let calls = 0
    const input = {
      safe: 1,
      get dangerous() {
        getterReads += 1
        throw new Error('getter must not run')
      },
    }
    const proxied = new Proxy(
      { value: 2 },
      {
        get(target, key, receiver) {
          proxyGets += 1
          if (key === 'value') throw new Error('proxy get must not run')
          return Reflect.get(target, key, receiver)
        },
      },
    )
    class Repository {
      consume(...values: object[]) {
        calls += 1
        return values.length
      }
    }
    const Module = defineModule(() => ({ providers: [Repository] }))
    const application = defineApplication({ modules: [Module()] })
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation([]),
    })
    await runtime.initialize()
    const repository = runtime.get(Repository)
    const lease = runtime.beginExecution({
      executionId: 'unsafe-input.test',
      executionKind: 'custom',
    })

    expect(lease.run!(() => repository.consume(input, proxied))).toBe(2)
    lease.complete()
    expect(calls).toBe(1)
    expect(getterReads).toBe(0)
    expect(proxyGets).toBe(0)

    await runtime.shutdown()
  })

  it('transient provider methodはtraceするがdirect replay capsuleは作らない', async () => {
    class TransientRepository {
      read(value: number) {
        return value * 2
      }
    }
    class Service {
      constructor(readonly repository = inject(TransientRepository)) {}

      read(value: number) {
        return this.repository.read(value)
      }
    }
    const Module = defineModule(() => ({
      providers: [
        provide(TransientRepository).useClass(TransientRepository, {
          scope: 'transient',
        }),
        Service,
      ],
    }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()
    const service = runtime.get(Service)
    const lease = runtime.beginExecution({
      executionId: 'transient.test',
      executionKind: 'custom',
    })

    expect(lease.run!(() => service.read(4))).toBe(8)
    lease.complete()

    const span = events.find(
      (event) =>
        event.type === 'span.started' &&
        event.kind === 'provider.method' &&
        event.name === 'TransientRepository.read',
    )
    expect(span).toMatchObject({
      type: 'span.started',
      kind: 'provider.method',
      name: 'TransientRepository.read',
    })
    expect(span).not.toHaveProperty('capsuleId')
    expect(span).not.toHaveProperty('replayable')

    await runtime.shutdown()
  })

  it('non-extensible providerはprototype methodを安全にskipする', async () => {
    class FrozenRepository {
      constructor() {
        Object.preventExtensions(this)
      }
      read() {
        return 42
      }
    }
    const Module = defineModule(() => ({ providers: [FrozenRepository] }))
    const application = defineApplication({ modules: [Module()] })
    const events: RuntimeEvent[] = []
    const runtime = new ApplicationKernelRuntime(application.model, {
      instrumentation: createTestInstrumentation(events),
    })
    await runtime.initialize()
    const repository = runtime.get(FrozenRepository)
    const lease = runtime.beginExecution({
      executionId: 'x',
      executionKind: 'custom',
    })
    expect(lease.run!(() => repository.read())).toBe(42)
    lease.complete()
    expect(
      events.filter(
        (event) =>
          event.type === 'span.started' && event.kind === 'provider.method',
      ),
    ).toEqual([])
    await runtime.shutdown()
  })
})
