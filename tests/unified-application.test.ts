import { bindQueueDriver, defineApplication } from '@loutrejs/application'
import { bootstrap } from '@loutrejs/application/host'
import {
  consume,
  cron,
  defineModule,
  entrypoint,
  fixedDelay,
  inject,
  queue,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { z } from 'zod'

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

  test('Cron / fixed-delay / Queue ConsumerをTrigger Rootとして登録する', async () => {
    const cleanup = entrypoint<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const poll = entrypoint<void, void>({
      name: 'poll',
      factory: () => () => undefined,
    })
    const process = entrypoint<{ id: string }, void>({
      name: 'orders.process',
      factory: () => () => undefined,
    })
    const nightly = cron({
      name: 'cleanup.nightly',
      expression: '0 3 * * *',
      timezone: 'Asia/Tokyo',
      entrypoint: cleanup,
    })
    const polling = fixedDelay({
      name: 'poll.remote',
      delay: 10_000,
      immediate: true,
      entrypoint: poll,
    })
    const orders = queue({
      name: 'orders',
      payload: z.object({ id: z.string() }),
    })
    let consumePayload: ((payload: unknown) => Promise<void>) | undefined
    const orderConsumer = consume({
      name: 'orders.process',
      queue: orders,
      entrypoint: process,
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
    }))
    const application = bootstrap(
      defineApplication({
        modules: [Module()],
        triggers: [nightly, polling, orderConsumer],
      }),
    )

    expect(application.graph.version).toBe(4)
    expect(application.graph.queues).toEqual([
      expect.objectContaining({ id: 'queue:orders', name: 'orders' }),
    ])
    expect(application.graph.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'cron',
          name: 'cleanup.nightly',
        }),
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'fixed-delay',
          name: 'poll.remote',
        }),
        expect.objectContaining({
          kind: 'trigger',
          trigger: 'queue-consumer',
          name: 'orders.process',
        }),
      ]),
    )
    expect(application.graph.executions).not.toContainEqual(
      expect.objectContaining({ kind: 'entrypoint', name: 'cleanup' }),
    )
    await application.triggers.start()
    await expect(application.triggers.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(consumePayload?.({ id: 'one' })).resolves.toBeUndefined()
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
    const invalidCron = cron({
      name: 'invalid.schedule',
      expression: '90 25 * * *',
      timezone: 'Invalid/Timezone',
      entrypoint: first,
    })
    const Module = defineModule(() => ({}))

    const result = compileApplication({
      modules: [Module()],
      entrypoints: [first, second],
      triggers: [invalidCron],
    })

    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'LUTRE_ENTRYPOINT_DUPLICATE',
        'LUTRE_TRIGGER_INVALID_CRON',
        'LUTRE_TRIGGER_INVALID_TIMEZONE',
      ]),
    )
  })
})
