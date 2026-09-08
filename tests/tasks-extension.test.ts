import { describe, expect, expectTypeOf, it } from 'vitest'
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
