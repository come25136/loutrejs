import { binding, defineApplication } from '@loutrejs/loutre'
import { bootstrap } from '@loutrejs/loutre/host'
import {
  consume,
  cron,
  defineArgs,
  defineModule,
  fixedDelay,
  inject,
  queue,
  task,
} from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import { z } from 'zod'

describe('Unified Application', () => {
  test('public Taskを一度だけ構築し、descriptor指定で実行結果を返す', async () => {
    let constructions = 0
    const ServiceToken = class Service {
      value = 40
    }
    const calculate = task<number, number>({
      name: 'calculate',
      factory: (service = inject(ServiceToken)) => {
        constructions += 1
        return async (input) => service.value + input
      },
    })
    const Module = defineModule(() => ({ providers: [ServiceToken] }))
    const definition = defineApplication({
      modules: [Module()],
      tasks: [calculate],
    })
    const application = bootstrap({ application: definition })
    constructions = 0

    await expect(application.run(calculate, 2)).resolves.toBe(42)
    await expect(application.run(calculate, 3)).resolves.toBe(43)
    expect(constructions).toBe(1)
    expect(application.graph.executions).toContainEqual(
      expect.objectContaining({ id: 'task:calculate', kind: 'task' }),
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
    const application = bootstrap({
      application: defineApplication({ modules: [], tasks: [fail] }),
    })
    await expect(application.run(fail)).rejects.toThrow('domain failure')
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
    const definition = defineApplication({
      modules: [],
      arguments: AppArgs,
      tasks: [read],
    })
    const application = bootstrap({
      application: definition,
      arguments: { workers: '8' },
    })
    await expect(application.run(read)).resolves.toBe(8)
    expect(application.get(AppArgs).workers).toBe(8)
    expect(application.graph.arguments).toEqual({ name: 'AppArgs' })
    expect(application.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'arguments:AppArgs',
          kind: 'arguments',
          label: 'AppArgs',
        }),
        expect.objectContaining({
          id: 'task:arguments.read',
          kind: 'task',
          label: 'arguments.read',
        }),
      ]),
    )
    expect(application.graph.edges).toContainEqual({
      from: 'task:arguments.read',
      to: 'arguments:AppArgs',
      kind: 'inject',
      source: 'probed',
    })
    await application.close()
  })

  test('Task factory違反をTask diagnosticとして直接返す', () => {
    const invalid = task<void, void>({
      name: 'invalid.task',
      factory: (async () => () => undefined) as never,
    })
    const result = compileApplication({ modules: [], tasks: [invalid] })
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_TASK_ASYNC_FACTORY',
        path: 'task:invalid.task',
      }),
    )
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
    const application = bootstrap({
      application: defineApplication({ modules: [], tasks: [job] }),
    })
    const execution = application.run(job)
    await Promise.resolve()
    const closing = application.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    await expect(application.run(job)).rejects.toThrow('LUTRE_APP_STOPPING')
    release()
    await execution
    await closing
    await expect(application.run(job)).rejects.toThrow('LUTRE_APP_STOPPED')
    await expect(application.close()).resolves.toBeUndefined()
  })

  test('Cron / fixed-delay / Queue ConsumerをTrigger RootとしてTaskへ接続する', async () => {
    const cleanup = task<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const poll = task<void, void>({
      name: 'poll',
      factory: () => () => undefined,
    })
    const process = task<{ id: string }, void>({
      name: 'orders.process',
      factory: () => () => undefined,
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
      immediate: true,
      task: poll,
    })
    const orders = queue({
      name: 'orders',
      payload: z.object({ id: z.string() }),
    })
    let consumePayload: ((payload: unknown) => Promise<void>) | undefined
    const orderConsumer = consume({
      name: 'orders.process',
      queue: orders,
      task: process,
    })
    const Module = defineModule(() => ({
      providers: [
        binding.queue(orders, {
          async start({ consume: dispatch }) {
            consumePayload = dispatch
            return { stop: async () => undefined }
          },
        }),
      ],
    }))
    const application = bootstrap({
      application: defineApplication({
        modules: [Module()],
        triggers: [nightly, polling, orderConsumer],
      }),
    })

    expect(application.graph.queues).toEqual([
      expect.objectContaining({ id: 'queue:orders', name: 'orders' }),
    ])
    expect(application.graph.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'cron',
          name: 'cleanup.nightly',
          task: 'cleanup',
        }),
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'fixed-delay',
          name: 'poll.remote',
          task: 'poll',
        }),
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'queue-consumer',
          name: 'orders.process',
          task: 'orders.process',
        }),
      ]),
    )
    expect(application.graph.executions).not.toContainEqual(
      expect.objectContaining({ kind: 'task', name: 'cleanup' }),
    )
    expect('run' in application).toBe(false)
    await application.triggers.start()
    await expect(application.triggers.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(consumePayload?.({ id: 'one' })).resolves.toBeUndefined()
    await application.close()
  })

  test('Trigger重複名とportable cron違反をdiagnosticにする', () => {
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
    const duplicate = cron({
      name: 'maintenance',
      expression: '0 0 * * *',
      timezone: 'UTC',
      task: cleanup,
    })
    const result = compileApplication({
      modules: [],
      triggers: [invalidCron, duplicate],
    })
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'LUTRE_TRIGGER_DUPLICATE',
        'LUTRE_TRIGGER_INVALID_CRON',
        'LUTRE_TRIGGER_INVALID_TIMEZONE',
      ]),
    )
  })
})
