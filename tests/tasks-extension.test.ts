import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  bootstrapApplication,
  application,
  defineLayer,
  inject,
  module,
  provide,
  token,
  composeLayers,
  type ApplicationModel,
} from '@loutrejs/loutre'
import {
  trigger,
  bindQueueDriver,
  queue,
  task,
  type TasksHostApi,
} from '@loutrejs/loutre/tasks'
import { z } from 'zod'

describe('Task Execution Extension', () => {
  it('Task invocationをHost APIとactive executionへcontributeする', async () => {
    const PREFIX = token<string>('prefix')
    const greet = task<string, string>({
      name: 'greet',
      factory:
        (prefix = inject(PREFIX)) =>
        async (name) =>
          `${prefix}:${name}`,
    })
    const Module = module(() => ({
      providers: [provide(PREFIX).useValue('hello')],
      executions: [greet],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    expectTypeOf(app.tasks).toEqualTypeOf<TasksHostApi>()
    await expect(app.tasks.run(greet, 'loutre')).resolves.toBe('hello:loutre')
    const unregistered = task<string, string>({
      name: 'greet',
      factory: () => async (name) => `unregistered:${name}`,
    })
    await expect(app.tasks.run(unregistered, 'loutre')).rejects.toThrow(
      'LUTRE_TASK_NOT_REGISTERED',
    )
    expect(app.graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'task.greet',
        kind: 'injects',
      }),
    )
    await app.close()
  })

  it('Host境界でraw Taskをcanonical identityへ解決しRuntime・Trigger・Graphへ持ち込まない', async () => {
    const registered = task<void, string>({
      name: 'snapshot-task',
      factory: () => async () => 'compiled-runtime',
    })
    const declaration = { ...registered.declaration }
    const hostInput = { ...registered, declaration }
    const schedule = trigger.fixedDelay({
      name: 'snapshot-trigger',
      delay: 10_000,
      task: hostInput,
    })
    const Module = module(() => ({
      executions: [schedule],
    }))
    const definition = application({ modules: [Module()] })
    const compiled = definition.model.extensions
      .values()[0]!
      .executions.map((execution) => execution.compiled as object)

    declaration.name = 'mutated-task'
    declaration.factory = () => () => 'mutated-runtime'

    expect(compiled).not.toContainEqual(
      expect.objectContaining({ definition: expect.anything() }),
    )
    expect(compiled).not.toContainEqual(
      expect.objectContaining({ task: expect.anything() }),
    )
    expect(
      applicationTaskMetadata(definition.model, 'trigger.snapshot-trigger'),
    ).toMatchObject({ task: 'snapshot-task' })
    expect(definition.model.executions.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'trigger.snapshot-trigger',
        'task.snapshot-task',
      ]),
    )
    expect(definition.model.edges).toContainEqual({
      from: 'trigger.snapshot-trigger',
      to: 'task.snapshot-task',
      kind: 'references',
    })

    const app = await bootstrapApplication({ application: definition })
    try {
      await expect(app.tasks.run(hostInput)).resolves.toBe('compiled-runtime')
    } finally {
      await app.close()
    }
  })

  it('参照先Taskをexecutionsへ明示併記しても同じDefinitionを二重compileしない', () => {
    const job = task({
      name: 'explicit-task',
      factory: () => async () => undefined,
    })
    const schedule = trigger.fixedDelay({
      name: 'explicit-trigger',
      delay: 10_000,
      task: job,
    })
    const Module = module(() => ({ executions: [job, schedule] }))

    const definition = application({ modules: [Module()] })

    expect(definition.model.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'LUTRE_EXECUTION_ID_COLLISION' }),
    )
    expect(
      definition.model.executions.filter(
        ({ id }) => id === 'task.explicit-task',
      ),
    ).toHaveLength(1)
    expect(definition.model.edges).toContainEqual({
      from: 'trigger.explicit-trigger',
      to: 'task.explicit-task',
      kind: 'references',
    })
  })

  it('明示ownerを持つ同じTask Definitionを複数Moduleから参照しても一度だけcompileする', () => {
    const job = task({
      name: 'shared-referenced-task',
      factory: () => async () => undefined,
    })
    const TaskModule = module(() => ({ executions: [job] }))
    const FirstModule = module(() => ({
      executions: [
        trigger.fixedDelay({
          name: 'first-shared-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const SecondModule = module(() => ({
      executions: [
        trigger.fixedDelay({
          name: 'second-shared-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))

    const definition = application({
      modules: [FirstModule(), TaskModule(), SecondModule()],
    })

    expect(definition.model.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'LUTRE_EXECUTION_ID_COLLISION' }),
    )
    expect(
      definition.model.executions.filter(
        ({ id }) => id === 'task.shared-referenced-task',
      ),
    ).toHaveLength(1)
    expect(definition.model.edges).toEqual(
      expect.arrayContaining([
        {
          from: 'trigger.first-shared-trigger',
          to: 'task.shared-referenced-task',
          kind: 'references',
        },
        {
          from: 'trigger.second-shared-trigger',
          to: 'task.shared-referenced-task',
          kind: 'references',
        },
      ]),
    )
  })

  it('implicit shared Taskのowner ambiguityをModule順に依存せずdiagnosticにする', () => {
    const DEP = token<string>('shared-task-dependency')
    const job = task({
      name: 'ambiguous-shared-task',
      factory:
        (dependency = inject(DEP)) =>
        async () =>
          dependency,
    })
    const FirstModule = module(() => ({
      providers: [provide(DEP).useValue('first')],
      executions: [
        trigger.fixedDelay({
          name: 'first-ambiguous-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const SecondModule = module(() => ({
      executions: [
        trigger.fixedDelay({
          name: 'second-ambiguous-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const first = FirstModule()
    const second = SecondModule()

    const forward = application({ modules: [first, second] }).model
    const reversed = application({ modules: [second, first] }).model
    const codes = (model: ApplicationModel) =>
      model.diagnostics.map(({ code }) => code).toSorted()

    expect(codes(forward)).toEqual(codes(reversed))
    expect(codes(forward)).toContain('LUTRE_EXECUTION_OWNER_AMBIGUOUS')
    expect(forward.executions).not.toContainEqual(
      expect.objectContaining({ id: 'task.ambiguous-shared-task' }),
    )
    expect(reversed.executions).not.toContainEqual(
      expect.objectContaining({ id: 'task.ambiguous-shared-task' }),
    )
  })

  it('長いfixedDelayは指定時刻まで待ち、次の待機中に停止できる', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const job = task({ name: 'monthly', factory: () => run })
    const delay = 2 ** 31 + 100
    const schedule = trigger.fixedDelay({
      name: 'monthly-trigger',
      delay,
      task: job,
    })
    try {
      await using app = await bootstrapApplication({
        application: application({
          modules: [module({ executions: [schedule] })],
        }),
      })
      await app.tasks.start()
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(run).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(run).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2 ** 31 - 1)
      await app.tasks.stop()
      await vi.advanceTimersByTimeAsync(delay)
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('close後は保持済みTrigger APIからresourceを再生成できない', async () => {
    const job = task({ name: 'closed-task', factory: () => async () => {} })
    const schedule = trigger.fixedDelay({
      name: 'closed-trigger',
      delay: 10_000,
      task: job,
    })
    const Module = module(() => ({ executions: [schedule] }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })
    const tasks = app.tasks

    await app.close()

    await expect(tasks.start()).rejects.toThrow('LUTRE_TASKS_STOPPED')
    await expect(tasks.stop()).resolves.toBeUndefined()
  })

  it('永久pendingのdirect Task invocationはshutdown timeoutの安全境界で停止する', async () => {
    const events: string[] = []
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const job = task({
      name: 'pending-direct-task',
      factory:
        (resource = inject(Resource)) =>
        async () => {
          void resource
          return new Promise<never>(() => undefined)
        },
    })
    const Module = module(() => ({
      providers: [Resource],
      executions: [job],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const invocation = app.tasks.run(job)

    await expect(
      Promise.race([
        app.close(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('shutdown hung')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual([])
    void invocation
  })

  it('Cronのday-of-monthとday-of-weekを両方指定した場合はどちらかが一致すれば実行する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    const executions: Date[] = []
    const job = task({
      name: 'cron-day-or-task',
      factory: () => async () => {
        executions.push(new Date())
      },
    })
    const schedule = trigger.cron({
      name: 'cron-day-or-trigger',
      expression: '0 0 1 * 1',
      timezone: 'UTC',
      task: job,
    })
    const Module = module(() => ({ executions: [schedule] }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    try {
      await app.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-09-07T00:00:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toEqual([
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-07T00:00:01.000Z'),
      ])
    } finally {
      await app.close()
      vi.useRealTimers()
    }
  })

  it('Cronのday-of-week rangeに含まれる7をSundayとして実行する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T00:00:00.000Z'))
    let executions = 0
    const job = task({
      name: 'cron-sunday-range-task',
      factory: () => async () => {
        executions += 1
      },
    })
    const schedule = trigger.cron({
      name: 'cron-sunday-range-trigger',
      expression: '0 0 * * 1-7',
      timezone: 'UTC',
      task: job,
    })
    const Module = module(() => ({ executions: [schedule] }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    try {
      await app.tasks.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(executions).toBe(1)
    } finally {
      await app.close()
      vi.useRealTimers()
    }
  })

  it('Cronのday-of-monthに*を含む場合はday-of-weekとのOR条件にしない', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    let executions = 0
    const job = task({
      name: 'cron-unrestricted-day-task',
      factory: () => async () => {
        executions += 1
      },
    })
    const schedule = trigger.cron({
      name: 'cron-unrestricted-day-trigger',
      expression: '0 0 */2 * 1',
      timezone: 'UTC',
      task: job,
    })
    const Module = module(() => ({ executions: [schedule] }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    try {
      await app.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toBe(0)
    } finally {
      await app.close()
      vi.useRealTimers()
    }
  })

  it('CronはDST fall-backで重複するローカル時刻を別の実時刻として実行する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T05:30:00.000Z'))
    const executions: Date[] = []
    const job = task({
      name: 'cron-fall-back-task',
      factory: () => async () => {
        executions.push(new Date())
      },
    })
    const schedule = trigger.cron({
      name: 'cron-fall-back-trigger',
      expression: '30 1 * * *',
      timezone: 'America/New_York',
      task: job,
    })
    const Module = module(() => ({ executions: [schedule] }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    try {
      await app.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-11-01T06:30:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toEqual([
        new Date('2026-11-01T05:30:00.000Z'),
        new Date('2026-11-01T06:30:01.000Z'),
      ])
    } finally {
      await app.close()
      vi.useRealTimers()
    }
  })

  it('Queue driver startup中のshutdownはProvider cleanupより先にstartupを回収する', async () => {
    const events: string[] = []
    let markStarted!: () => void
    let releaseStart!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const release = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const descriptor = queue({ name: 'shutdown-events', payload: z.string() })
    const job = task<string, void>({
      name: 'shutdown-task',
      factory:
        (resource = inject(Resource)) =>
        async () => {
          void resource
        },
    })
    const schedule = trigger.consume({
      name: 'shutdown-consumer',
      queue: descriptor,
      task: job,
    })
    const driver = {
      async start() {
        events.push('driver.start')
        markStarted()
        await release
        events.push('driver.started')
        return {
          async stop() {
            events.push('driver.stop')
          },
        }
      },
    }
    const Module = module(() => ({
      providers: [Resource, bindQueueDriver(descriptor, driver)],
      executions: [schedule],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const startup = app.tasks.start()
    await started

    await expect(
      Promise.race([
        app.close(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('shutdown hung')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual(['driver.start'])

    releaseStart()
    await expect(startup).rejects.toThrow('LUTRE_TASKS_DRAINING')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(app.close()).resolves.toBeUndefined()
    expect(events).toEqual([
      'driver.start',
      'driver.started',
      'driver.stop',
      'provider.destroy',
    ])
  })

  it('Trigger startup失敗時は開始済みhandleのcleanup失敗も保持する', async () => {
    const startupError = new Error('startup failure')
    const cleanupError = new Error('cleanup failure')
    let stopAttempts = 0
    const firstQueue = queue({ name: 'first-startup', payload: z.string() })
    const secondQueue = queue({ name: 'second-startup', payload: z.string() })
    const job = task<string, void>({
      name: 'startup-task',
      factory: () => async () => undefined,
    })
    const FirstConsumer = trigger.consume({
      name: 'first-startup-consumer',
      queue: firstQueue,
      task: job,
    })
    const SecondConsumer = trigger.consume({
      name: 'second-startup-consumer',
      queue: secondQueue,
      task: job,
    })
    const Module = module(() => ({
      providers: [
        bindQueueDriver(firstQueue, {
          async start() {
            return {
              async stop() {
                stopAttempts += 1
                if (stopAttempts === 1) throw cleanupError
              },
            }
          },
        }),
        bindQueueDriver(secondQueue, {
          async start() {
            throw startupError
          },
        }),
      ],
      executions: [FirstConsumer, SecondConsumer],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
    })

    let thrown: unknown
    try {
      await app.tasks.start()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      startupError,
      cleanupError,
    ])
    await expect(app.tasks.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(app.tasks.stop()).resolves.toBeUndefined()
    expect(stopAttempts).toBe(2)
    await app.close()
  })

  it('Trigger stopが永久pendingならshutdown timeout後もProvider cleanupへ進まない', async () => {
    const events: string[] = []
    const descriptor = queue({ name: 'pending-stop', payload: z.string() })
    const job = task<string, void>({
      name: 'pending-stop-task',
      factory: () => async () => undefined,
    })
    const schedule = trigger.consume({
      name: 'pending-stop-consumer',
      queue: descriptor,
      task: job,
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = module(() => ({
      providers: [
        Resource,
        bindQueueDriver(descriptor, {
          async start() {
            return {
              stop() {
                events.push('driver.stop')
                return new Promise<void>(() => undefined)
              },
            }
          },
        }),
      ],
      executions: [schedule],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    await app.tasks.start()

    await expect(
      Promise.race([
        app.close(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('shutdown hung')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual(['driver.stop'])
  })

  it('Queue descriptorのprivate keyをbundle-safeなglobal identityにする', () => {
    const descriptor = queue({ name: 'events', payload: z.string() })
    const recreated = { ...descriptor }
    const driver = { start: async () => ({ stop: async () => {} }) }

    expect(
      Reflect.get(recreated, Symbol.for('loutre.tasks.queue-driver')),
    ).toBe(Reflect.get(descriptor, Symbol.for('loutre.tasks.queue-driver')))
    expect(bindQueueDriver(recreated, driver).provide).toBe(
      bindQueueDriver(descriptor, driver).provide,
    )
  })
})

function applicationTaskMetadata(
  model: ApplicationModel,
  executionId: string,
): unknown {
  const group = model.extensions.values()[0]
  const execution = group?.executions.find((item) => item.id === executionId)
  return group?.extension.projectGraph?.({ execution: execution! })
}

describe('generic Layer', () => {
  it('transport非依存stateをaround compositionでcontributeする', async () => {
    const events: string[] = []
    const tracing = defineLayer<{ readonly traceId: string }>({
      name: 'tracing',
      factory: () => async (_context, next) => {
        events.push('before')
        await next({ traceId: 'trace-1' })
        events.push('after')
      },
    })

    const result = await composeLayers({
      context: { requestId: 'request-1' },
      layers: [tracing],
      resolve: () => undefined as never,
      terminal: async (context) =>
        `${context.requestId}:${String(context.state.traceId)}`,
    })

    expect(result).toBe('request-1:trace-1')
    expect(events).toEqual(['before', 'after'])
  })
  it('state namespaceの暗黙上書きを拒否しplain objectは非重複propertyだけmergeする', async () => {
    const first = defineLayer<{ session: { id: string } }>({
      name: 'first',
      factory: () => async (_context, next) => {
        await next({ session: { id: 'session-1' } })
      },
    })
    const extend = defineLayer<{ session: { role: string } }>({
      name: 'extend',
      factory: () => async (_context, next) => {
        await next({ session: { role: 'admin' } })
      },
    })
    const overwrite = defineLayer<{ session: { id: string } }>({
      name: 'overwrite',
      factory: () => async (_context, next) => {
        await next({ session: { id: 'session-2' } })
      },
    })

    await expect(
      composeLayers({
        context: {},
        layers: [first, extend],
        resolve: () => undefined as never,
        terminal: async (context) => context.state,
      }),
    ).resolves.toEqual({ session: { id: 'session-1', role: 'admin' } })

    await expect(
      composeLayers({
        context: {},
        layers: [first, overwrite],
        resolve: () => undefined as never,
        terminal: async () => undefined,
      }),
    ).rejects.toThrow('cannot overwrite existing State property session.id')
  })

  it('awaitされないnext()を明示的に拒否しdownstream完了とerrorを回収する', async () => {
    const events: string[] = []
    const floating = defineLayer({
      name: 'floating',
      factory: () => async (_context, next) => {
        next()
      },
    })

    await expect(
      composeLayers({
        context: {},
        layers: [floating],
        resolve: () => undefined as never,
        terminal: async () => {
          await Promise.resolve()
          events.push('downstream-completed')
          throw new Error('downstream failure')
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof AggregateError &&
        error.message.includes('LUTRE_LAYER_NEXT_NOT_AWAITED') &&
        error.errors.some(
          (nested) =>
            nested instanceof Error && nested.message === 'downstream failure',
        ),
    )
    expect(events).toEqual(['downstream-completed'])
  })
})
