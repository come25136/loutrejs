import { defineApplication } from '@loutrejs/application'
import { bootstrap } from '@loutrejs/application/host'
import {
  consumer,
  defineModule,
  entrypoint,
  inject,
  queue,
  schedule,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'

describe('Unified Application', () => {
  test('Entrypointを一度だけ構築し、実行結果とerrorをそのまま返す', async () => {
    let constructions = 0
    const ServiceToken = class Service {
      value = 40
    }
    const calculate = entrypoint<number, number>({
      name: 'calculate',
      factory: (service = inject(ServiceToken)) => {
        constructions += 1
        return async (input) => service.value + input
      },
    })
    const fail = entrypoint<void, void>({
      name: 'fail',
      factory: () => () => {
        throw new Error('domain failure')
      },
    })
    const Module = defineModule(() => ({ providers: [ServiceToken] }))
    const application = bootstrap(
      defineApplication({
        modules: [Module()],
        entrypoints: [calculate, fail],
      }),
    )
    constructions = 0

    await expect(application.run(calculate, 2)).resolves.toBe(42)
    await expect(application.run(calculate, 3)).resolves.toBe(43)
    await expect(application.run(fail)).rejects.toThrow('domain failure')
    expect(constructions).toBe(1)
    expect(application.graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'entrypoint:calculate',
        kind: 'entrypoint',
      }),
    )
    expect(application.graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'entrypoint:calculate',
        to: 'class:Service',
        source: 'probed',
      }),
    )
    await application.close()
  })

  test('closeはactive executionを待ち、新規executionを拒否する', async () => {
    let release!: () => void
    const blocker = new Promise<void>((resolve) => {
      release = resolve
    })
    const job = entrypoint<void, void>({
      name: 'job',
      factory: () => async () => blocker,
    })
    const Module = defineModule(() => ({}))
    const application = bootstrap(
      defineApplication({ modules: [Module()], entrypoints: [job] }),
    )

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

  test('ScheduleとQueue ConsumerをGraphへ登録し、二重開始を拒否する', async () => {
    const cleanup = entrypoint<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const process = entrypoint<{ id: string }, void>({
      name: 'orders.process',
      factory: () => () => undefined,
    })
    const nightly = schedule({
      name: 'cleanup.nightly',
      cron: { expression: '0 3 * * *', timezone: 'Asia/Tokyo' },
      entrypoint: cleanup,
    })
    const orders = queue<{ id: string }>({ name: 'orders' })
    const orderConsumer = consumer({
      name: 'orders.process',
      queue: orders,
      entrypoint: process,
    })
    const Module = defineModule(() => ({}))
    const application = bootstrap(
      defineApplication({
        modules: [Module()],
        schedules: [nightly],
        consumers: [orderConsumer],
      }),
    )

    expect(application.graph.queues).toEqual([
      { id: 'queue:orders', name: 'orders' },
    ])
    expect(application.graph.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'schedule', name: 'cleanup.nightly' }),
        expect.objectContaining({
          kind: 'queue-consumer',
          name: 'orders.process',
        }),
      ]),
    )
    await application.scheduler.start()
    await expect(application.scheduler.start()).rejects.toThrow(
      'LUTRE_SCHEDULER_ALREADY_STARTED',
    )
    await application.queue.listen()
    await expect(application.queue.listen()).rejects.toThrow(
      'LUTRE_QUEUE_ALREADY_LISTENING',
    )
    await application.close()
  })

  test('execution descriptorの重複名とportable cron違反をdiagnosticにする', () => {
    const first = entrypoint<void, void>({
      name: 'duplicate',
      factory: () => () => undefined,
    })
    const second = entrypoint<void, void>({
      name: 'duplicate',
      factory: () => () => undefined,
    })
    const invalidSchedule = schedule({
      name: 'invalid.schedule',
      cron: { expression: '90 25 * * *', timezone: 'Invalid/Timezone' },
      entrypoint: first,
    })
    const Module = defineModule(() => ({}))

    const result = compileApplication({
      modules: [Module()],
      entrypoints: [first, second],
      schedules: [invalidSchedule],
    })

    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'LUTRE_ENTRYPOINT_DUPLICATE',
        'LUTRE_SCHEDULE_INVALID_CRON',
        'LUTRE_SCHEDULE_INVALID_TIMEZONE',
      ]),
    )
  })
})
