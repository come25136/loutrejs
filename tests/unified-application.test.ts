import {
  bootstrapApplication,
  defineApplication,
  defineArgs,
  defineModule,
  inject,
} from '@loutrejs/loutre'
import {
  bindQueueDriver,
  consume,
  cron,
  fixedDelay,
  queue,
  task,
} from '@loutrejs/tasks'
import { z } from 'zod'

describe('Task/Trigger Application', () => {
  test('Taskを一度だけ構築し、definition指定で実行結果を返す', async () => {
    let constructions = 0
    class Service {
      value = 40
    }
    const calculate = task<number, number>({
      name: 'calculate',
      factory: (service = inject(Service)) => {
        constructions += 1
        return async (input) => service.value + input
      },
    })
    const Module = defineModule(() => ({
      providers: [Service],
      executions: [calculate],
    }))
    const definition = defineApplication({ modules: [Module()] })
    constructions = 0
    const application = await bootstrapApplication({ application: definition })

    await expect(application.tasks.run(calculate, 2)).resolves.toBe(42)
    await expect(application.tasks.run(calculate, 3)).resolves.toBe(43)
    expect(constructions).toBe(1)
    expect(application.graph.executions).toContainEqual(
      expect.objectContaining({
        id: 'task.calculate',
        executionKind: 'task.invocation',
      }),
    )
    await application.close()
  })

  test('Task errorをそのまま返す', async () => {
    const fail = task<void, void>({
      name: 'fail',
      factory: () => () => {
        throw new Error('domain failure')
      },
    })
    const Module = defineModule(() => ({ executions: [fail] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    await expect(application.tasks.run(fail)).rejects.toThrow('domain failure')
    await application.close()
  })

  test('Argumentsをbootstrap前にvalidationしてDIする', async () => {
    class AppArgs extends defineArgs(
      z.object({ workers: z.coerce.number().int().positive() }),
    ) {}
    const read = task<void, number>({
      name: 'arguments.read',
      factory:
        (args = inject(AppArgs)) =>
        () =>
          args.workers,
    })
    const Module = defineModule(() => ({ executions: [read] }))
    const definition = defineApplication({
      modules: [Module()],
      arguments: AppArgs,
    })
    const application = await bootstrapApplication({
      application: definition,
      arguments: { workers: '8' },
    })

    await expect(application.tasks.run(read)).resolves.toBe(8)
    expect(application.get(AppArgs).workers).toBe(8)
    expect(application.graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'task.arguments.read',
        kind: 'injects',
      }),
    )
    await application.close()
  })

  test('closeはactive executionを待ち、新規executionを拒否する', async () => {
    let release!: () => void
    const blocker = new Promise<void>((resolve) => {
      release = resolve
    })
    const job = task<void, void>({
      name: 'job',
      factory: () => async () => blocker,
    })
    const Module = defineModule(() => ({ executions: [job] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    const execution = application.tasks.run(job)
    await Promise.resolve()
    const closing = application.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    await expect(application.tasks.run(job)).rejects.toThrow(
      'LUTRE_TASKS_DRAINING',
    )
    release()
    await execution
    await closing
    await expect(application.tasks.run(job)).rejects.toThrow(
      'LUTRE_TASKS_STOPPED',
    )
    await expect(application.close()).resolves.toBeUndefined()
  })

  test('Cron / fixed-delay / Queue ConsumerをExecution RootとしてTaskへ接続する', async () => {
    const cleanup = task<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const poll = task<void, void>({
      name: 'poll',
      factory: () => () => undefined,
    })
    const processed: string[] = []
    const process = task<{ id: string }, void>({
      name: 'orders.process',
      factory: () => (input) => {
        processed.push(input.id)
      },
    })
    const nightly = cron({
      name: 'cleanup.nightly',
      expression: '0 3 * * *',
      timezone: 'Asia/Tokyo',
      task: cleanup,
    })
    const polling = fixedDelay({
      name: 'poll.remote',
      delay: 10_000,
      immediate: false,
      task: poll,
    })
    const orders = queue({
      name: 'orders',
      payload: z.object({ id: z.string() }),
    })
    let consumePayload: ((payload: unknown) => Promise<void>) | undefined
    const orderConsumer = consume({
      name: 'orders.consumer',
      queue: orders,
      task: process,
    })
    const Module = defineModule(() => ({
      providers: [
        bindQueueDriver(orders, {
          async start({ consume: dispatch }) {
            consumePayload = dispatch
            return { stop: async () => undefined }
          },
        }),
      ],
      executions: [nightly, polling, orderConsumer],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    expect(application.graph.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'trigger.cleanup.nightly',
          executionKind: 'trigger.cron',
        }),
        expect.objectContaining({
          id: 'trigger.poll.remote',
          executionKind: 'trigger.fixed-delay',
        }),
        expect.objectContaining({
          id: 'trigger.orders.consumer',
          executionKind: 'trigger.queue-consumer',
        }),
      ]),
    )
    expect(
      application.graph.executions.find(
        (execution) => execution.id === 'trigger.orders.consumer',
      )?.extension?.metadata,
    ).toEqual({
      type: 'queue-consumer',
      name: 'orders.consumer',
      queue: 'orders',
      task: 'orders.process',
    })

    await application.tasks.start()
    await expect(application.tasks.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(consumePayload?.({ id: 'one' })).resolves.toBeUndefined()
    expect(processed).toEqual(['one'])
    await application.close()
  })

  test('referenced Taskを自動登録しportable cron違反・timezone違反だけをdiagnosticにする', () => {
    const cleanup = task<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const invalidCron = cron({
      name: 'maintenance',
      expression: '90 25 * * *',
      timezone: 'Invalid/Timezone',
      task: cleanup,
    })
    const Module = defineModule(() => ({ executions: [invalidCron] }))
    const definition = defineApplication({ modules: [Module()] })
    expect(definition.model.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'LUTRE_TRIGGER_INVALID_CRON',
        'LUTRE_TRIGGER_INVALID_TIMEZONE',
      ]),
    )
  })
})
