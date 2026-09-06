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
} from '@loutrejs/loutre'
import { task, type TasksHostApi } from '@loutrejs/tasks'

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
})

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
})
