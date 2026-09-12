import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineLayer,
  inject,
  defineModule,
  provide,
  token,
  composeLayers,
  type ApplicationModel,
} from '@loutrejs/loutre'
import {
  bindQueueDriver,
  consume,
  cron,
  fixedDelay,
  queue,
  task,
  type TasksHostApi,
} from '@loutrejs/tasks'
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
    const Module = defineModule(() => ({
      providers: [provide(PREFIX).useValue('hello')],
      executions: [greet],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    expectTypeOf(application.tasks).toEqualTypeOf<TasksHostApi>()
    await expect(application.tasks.run(greet, 'loutre')).resolves.toBe(
      'hello:loutre',
    )
    const unregistered = task<string, string>({
      name: 'greet',
      factory: () => async (name) => `unregistered:${name}`,
    })
    await expect(application.tasks.run(unregistered, 'loutre')).rejects.toThrow(
      'LUTRE_TASK_NOT_REGISTERED',
    )
    expect(application.graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'task.greet',
        kind: 'injects',
      }),
    )
    await application.close()
  })

  it('Host境界でraw Taskをcanonical identityへ解決しRuntime・Trigger・Graphへ持ち込まない', async () => {
    const registered = task<void, string>({
      name: 'snapshot-task',
      factory: () => async () => 'compiled-runtime',
    })
    const hostInput = { ...registered }
    const trigger = fixedDelay({
      name: 'snapshot-trigger',
      delay: 10_000,
      task: hostInput,
    })
    const Module = defineModule(() => ({
      executions: [trigger],
    }))
    const definition = defineApplication({ modules: [Module()] })
    const compiled = definition.model.extensions
      .values()[0]!
      .executions.map((execution) => execution.compiled as object)

    ;(hostInput as { name: string }).name = 'mutated-task'
    ;(hostInput as { factory: () => () => string }).factory = () => () =>
      'mutated-runtime'

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

    const application = await bootstrapApplication({ application: definition })
    try {
      await expect(application.tasks.run(hostInput)).resolves.toBe(
        'compiled-runtime',
      )
    } finally {
      await application.close()
    }
  })

  it('参照先Taskをexecutionsへ明示併記しても同じDefinitionを二重compileしない', () => {
    const job = task({
      name: 'explicit-task',
      factory: () => async () => undefined,
    })
    const trigger = fixedDelay({
      name: 'explicit-trigger',
      delay: 10_000,
      task: job,
    })
    const Module = defineModule(() => ({ executions: [job, trigger] }))

    const definition = defineApplication({ modules: [Module()] })

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
    const TaskModule = defineModule(() => ({ executions: [job] }))
    const FirstModule = defineModule(() => ({
      executions: [
        fixedDelay({
          name: 'first-shared-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const SecondModule = defineModule(() => ({
      executions: [
        fixedDelay({
          name: 'second-shared-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))

    const definition = defineApplication({
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
    const FirstModule = defineModule(() => ({
      providers: [provide(DEP).useValue('first')],
      executions: [
        fixedDelay({
          name: 'first-ambiguous-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const SecondModule = defineModule(() => ({
      executions: [
        fixedDelay({
          name: 'second-ambiguous-trigger',
          delay: 10_000,
          task: job,
        }),
      ],
    }))
    const first = FirstModule()
    const second = SecondModule()

    const forward = defineApplication({ modules: [first, second] }).model
    const reversed = defineApplication({ modules: [second, first] }).model
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

  it('close後は保持済みTrigger APIからresourceを再生成できない', async () => {
    const job = task({ name: 'closed-task', factory: () => async () => {} })
    const trigger = fixedDelay({
      name: 'closed-trigger',
      delay: 10_000,
      task: job,
    })
    const Module = defineModule(() => ({ executions: [trigger] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    const tasks = application.tasks

    await application.close()

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
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [job],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const invocation = application.tasks.run(job)

    await expect(
      Promise.race([
        application.close(),
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
    const trigger = cron({
      name: 'cron-day-or-trigger',
      expression: '0 0 1 * 1',
      timezone: 'UTC',
      task: job,
    })
    const Module = defineModule(() => ({ executions: [trigger] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    try {
      await application.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-09-07T00:00:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toEqual([
        new Date('2026-09-01T00:00:00.000Z'),
        new Date('2026-09-07T00:00:01.000Z'),
      ])
    } finally {
      await application.close()
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
    const trigger = cron({
      name: 'cron-sunday-range-trigger',
      expression: '0 0 * * 1-7',
      timezone: 'UTC',
      task: job,
    })
    const Module = defineModule(() => ({ executions: [trigger] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    try {
      await application.tasks.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(executions).toBe(1)
    } finally {
      await application.close()
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
    const trigger = cron({
      name: 'cron-unrestricted-day-trigger',
      expression: '0 0 */2 * 1',
      timezone: 'UTC',
      task: job,
    })
    const Module = defineModule(() => ({ executions: [trigger] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    try {
      await application.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toBe(0)
    } finally {
      await application.close()
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
    const trigger = cron({
      name: 'cron-fall-back-trigger',
      expression: '30 1 * * *',
      timezone: 'America/New_York',
      task: job,
    })
    const Module = defineModule(() => ({ executions: [trigger] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    try {
      await application.tasks.start()
      await vi.advanceTimersByTimeAsync(0)
      vi.setSystemTime(new Date('2026-11-01T06:30:00.000Z'))
      await vi.advanceTimersByTimeAsync(1_000)

      expect(executions).toEqual([
        new Date('2026-11-01T05:30:00.000Z'),
        new Date('2026-11-01T06:30:01.000Z'),
      ])
    } finally {
      await application.close()
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
    const trigger = consume({
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
    const Module = defineModule(() => ({
      providers: [Resource, bindQueueDriver(descriptor, driver)],
      executions: [trigger],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const startup = application.tasks.start()
    await started

    await expect(
      Promise.race([
        application.close(),
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
    await expect(application.close()).resolves.toBeUndefined()
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
    const FirstConsumer = consume({
      name: 'first-startup-consumer',
      queue: firstQueue,
      task: job,
    })
    const SecondConsumer = consume({
      name: 'second-startup-consumer',
      queue: secondQueue,
      task: job,
    })
    const Module = defineModule(() => ({
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
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    let thrown: unknown
    try {
      await application.tasks.start()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([
      startupError,
      cleanupError,
    ])
    await expect(application.tasks.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(application.tasks.stop()).resolves.toBeUndefined()
    expect(stopAttempts).toBe(2)
    await application.close()
  })

  it('Trigger stopが永久pendingならshutdown timeout後もProvider cleanupへ進まない', async () => {
    const events: string[] = []
    const descriptor = queue({ name: 'pending-stop', payload: z.string() })
    const job = task<string, void>({
      name: 'pending-stop-task',
      factory: () => async () => undefined,
    })
    const trigger = consume({
      name: 'pending-stop-consumer',
      queue: descriptor,
      task: job,
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
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
      executions: [trigger],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    await application.tasks.start()

    await expect(
      Promise.race([
        application.close(),
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
