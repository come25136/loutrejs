import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineLayer,
  defineModule,
  provide,
  token,
  composeLayers,
} from '@loutrejs/loutre'
import { task, type TasksHostApi } from '@loutrejs/tasks'

describe('Task Execution Extension', () => {
  it('Task invocationをHost APIとactive executionへcontributeする', async () => {
    const PREFIX = token<string>('prefix')
    const greet = task<string, string, readonly [typeof PREFIX]>({
      name: 'greet',
      inject: [PREFIX],
      factory: (prefix) => async (name) => `${prefix}:${name}`,
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
    const tracing = defineLayer<
      { readonly requestId: string },
      { readonly traceId: string },
      string
    >({
      name: 'tracing',
      factory: () => async (_context, next) => {
        events.push('before')
        const result = await next({ traceId: 'trace-1' })
        events.push('after')
        return result
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
})
