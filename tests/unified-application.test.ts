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
  test('Applicationの単一Entrypointを一度だけ構築し、実行結果を返す', async () => {
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
    const Module = defineModule(() => ({ providers: [ServiceToken] }))
    const application = bootstrap(
      defineApplication({ modules: [Module()], entrypoint: calculate }),
    )
    constructions = 0

    await expect(application.run(2)).resolves.toBe(42)
    await expect(application.run(3)).resolves.toBe(43)
    expect(constructions).toBe(1)
    expect(application.graph.executions).toContainEqual(
      expect.objectContaining({
        id: 'entrypoint:calculate',
        kind: 'entrypoint',
      }),
    )
    await application.close()
  })

  test('Entrypoint errorをそのまま返す', async () => {
    const fail = entrypoint<void, void>({
      name: 'fail',
      factory: () => () => {
        throw new Error('domain failure')
      },
    })
    const application = bootstrap(
      defineApplication({ modules: [], entrypoint: fail }),
    )

    await expect(application.run()).rejects.toThrow('domain failure')
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
      defineApplication({ modules: [Module()], entrypoint: job }),
    )

    const execution = application.run()
    await Promise.resolve()
    const closing = application.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    await expect(application.run()).rejects.toThrow('LUTRE_APP_STOPPING')
    release()
    await execution
    await closing
    await expect(application.run()).rejects.toThrow('LUTRE_APP_STOPPED')
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
    expect('run' in application).toBe(false)
    await application.triggers.start()
    await expect(application.triggers.start()).rejects.toThrow(
      'LUTRE_TRIGGERS_ALREADY_STARTED',
    )
    await expect(consumePayload?.({ id: 'one' })).resolves.toBeUndefined()
    await application.close()
  })

  test('Trigger重複名とportable cron違反をdiagnosticにする', () => {
    const cleanup = entrypoint<void, void>({
      name: 'cleanup',
      factory: () => () => undefined,
    })
    const invalidCron = cron({
      name: 'maintenance',
      expression: '90 25 * * *',
      timezone: 'Invalid/Timezone',
      entrypoint: cleanup,
    })
    const duplicate = cron({
      name: 'maintenance',
      expression: '0 0 * * *',
      timezone: 'UTC',
      entrypoint: cleanup,
    })
    const Module = defineModule(() => ({}))

    const result = compileApplication({
      modules: [Module()],
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
