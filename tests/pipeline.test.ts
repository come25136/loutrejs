import {
  contextKey,
  inject,
  layer,
  provide,
  shortCircuit,
  token,
  type LayerDescriptor,
  type PipelineItem,
  type TerminalLayerDescriptor,
} from '@loutrejs/loutre'
import {
  Container,
  LayerContractError,
  executePipeline,
} from '@loutrejs/loutre/runtime'

const terminal: TerminalLayerDescriptor<'test'> = {
  kind: 'terminal',
  name: 'test.terminal',
  role: 'terminal',
  protocol: 'test',
}

function hooks(
  context: Record<string, unknown>,
  terminalResult: unknown = 'done',
) {
  type ExecutableLayerRuntime = (
    context: object,
    next: (...arguments_: readonly unknown[]) => Promise<void>,
  ) => Promise<unknown>
  const runtimes = new Map<LayerDescriptor, ExecutableLayerRuntime>()
  return {
    context,
    validate: () => undefined,
    terminal: () => terminalResult,
    layer: (descriptor: LayerDescriptor) => {
      const cached = runtimes.get(descriptor)
      if (cached) return cached
      const runtime = descriptor.factory() as unknown as ExecutableLayerRuntime
      runtimes.set(descriptor, runtime)
      return runtime
    },
  }
}

describe('continuation Pipeline', () => {
  it('next()をちょうど1回実行してcontinuationを包む', async () => {
    const events: string[] = []
    const timing = layer({
      name: 'timing',
      factory: () => async (_ctx, next) => {
        events.push('before')
        await next()
        events.push('after')
      },
    })

    await expect(executePipeline([timing, terminal], hooks({}))).resolves.toBe(
      'done',
    )
    expect(events).toEqual(['before', 'after'])
  })

  it('正常returnでnext()を呼ばないLayerを拒否する', async () => {
    const skipped = layer({
      name: 'skipped',
      factory: () => async () => undefined,
    })

    await expect(
      executePipeline([skipped, terminal], hooks({})),
    ).rejects.toThrow('LUTRE_LAYER_NEXT_SKIPPED')
  })

  it('next()の2回目をLayerがcatchしても拒否する', async () => {
    const reentered = layer({
      name: 'reentered',
      factory: () => async (_ctx, next) => {
        await next()
        try {
          await next()
        } catch {}
      },
    })

    await expect(
      executePipeline([reentered, terminal], hooks({})),
    ).rejects.toThrow('LUTRE_LAYER_NEXT_REENTRY')
  })

  it('next()より前のthrowをそのまま伝播する', async () => {
    const failure = new Error('before next')
    const broken = layer({
      name: 'broken',
      factory: () => async () => {
        throw failure
      },
    })

    await expect(executePipeline([broken, terminal], hooks({}))).rejects.toBe(
      failure,
    )
  })

  it('downstream errorをLayerが握り潰しても元errorを再throwする', async () => {
    const failure = new Error('child failure')
    const wrapper = layer({
      name: 'wrapper',
      factory: () => async (_ctx, next) => {
        try {
          await next()
        } catch {}
      },
    })
    const broken = layer({
      name: 'child',
      factory: () => async () => {
        throw failure
      },
    })

    await expect(
      executePipeline([wrapper([broken]), terminal], hooks({})),
    ).rejects.toBe(failure)
  })

  it('next()なしのshortCircuitを正常結果にする', async () => {
    const cached = layer({
      name: 'cached',
      factory: () => async () => shortCircuit('cached-result'),
    })

    await expect(executePipeline([cached, terminal], hooks({}))).resolves.toBe(
      'cached-result',
    )
  })

  it('next()後のshortCircuitを拒否する', async () => {
    const invalid = layer({
      name: 'invalid-short-circuit',
      factory: () => async (_ctx, next) => {
        await next()
        return shortCircuit('late')
      },
    })

    await expect(
      executePipeline([invalid, terminal], hooks({})),
    ).rejects.toThrow('LUTRE_LAYER_SHORT_CIRCUIT_AFTER_NEXT')
  })

  it('next(provided)のContextを後段へ追加する', async () => {
    const VALUE = contextKey<{ value: string }>('value')
    const context: Record<string, unknown> = {}
    const provider = layer({
      name: 'provider',
      provide: VALUE,
      factory: () => async (_ctx, next) => {
        await next({ value: 'ready' })
      },
    })
    const consumer = layer({
      name: 'consumer',
      requires: [VALUE],
      factory: () => async (ctx, next) => {
        expect(ctx.value).toBe('ready')
        await next()
      },
    })

    await executePipeline([provider, consumer, terminal], hooks(context))
    expect(context.value).toBe('ready')
  })

  it('childがprovideしたContextを親Pipeline後段へ維持する', async () => {
    const VALUE = contextKey<{ childValue: string }>('childValue')
    const context: Record<string, unknown> = {}
    const wrapper = layer({
      name: 'wrapper',
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const provider = layer({
      name: 'child-provider',
      provide: VALUE,
      factory: () => async (_ctx, next) => {
        await next({ childValue: 'ready' })
      },
    })
    const consumer = layer({
      name: 'parent-consumer',
      requires: [VALUE],
      factory: () => async (ctx, next) => {
        expect(ctx.childValue).toBe('ready')
        await next()
      },
    })

    await executePipeline(
      [wrapper([provider]), consumer, terminal],
      hooks(context),
    )
  })

  it('既存Context propertyの上書きを拒否する', async () => {
    const SESSION = contextKey<{ session: string }>('session')
    const provider = layer({
      name: 'provider',
      provide: SESSION,
      factory: () => async (_ctx, next) => {
        await next({ session: 'new' })
      },
    })

    await expect(
      executePipeline([provider, terminal], hooks({ session: 'existing' })),
    ).rejects.toThrow('cannot overwrite')
  })

  it('未宣言Context propertyを拒否する', async () => {
    const broken = layer({
      name: 'undeclared',
      factory: () => async (_ctx, next) => {
        await (next as (provided: object) => Promise<void>)({ extra: true })
      },
    })

    await expect(
      executePipeline([broken, terminal], hooks({})),
    ).rejects.toThrow('undeclared Context property extra')
  })

  it('Prisma風callback wrapperでchildだけを囲み親後段へ戻る', async () => {
    const events: string[] = []
    const transaction = layer({
      name: 'transaction',
      factory: () => async (_ctx, next) => {
        events.push('transaction.enter')
        await (async (callback: () => Promise<void>) => {
          await callback()
        })(next)
        events.push('transaction.exit')
      },
    })
    const child = layer({
      name: 'child',
      factory: () => async (_ctx, next) => {
        events.push('child')
        await next()
      },
    })
    const parent = layer({
      name: 'parent',
      factory: () => async (_ctx, next) => {
        events.push('parent')
        await next()
      },
    })

    await executePipeline([transaction([child]), parent, terminal], hooks({}))
    expect(events).toEqual([
      'transaction.enter',
      'child',
      'transaction.exit',
      'parent',
    ])
  })

  it.each([false, true])(
    'request timing風finallyをchild成功=%sでも実行する',
    async (fails) => {
      const events: string[] = []
      const timing = layer({
        name: 'timing',
        factory: () => async (_ctx, next) => {
          try {
            await next()
          } finally {
            events.push('finally')
          }
        },
      })
      const child = layer({
        name: 'child',
        factory: () => async (_ctx, next) => {
          if (fails) throw new Error('failure')
          await next()
        },
      })
      const execution = executePipeline([timing([child]), terminal], hooks({}))

      if (fails) await expect(execution).rejects.toThrow('failure')
      else await expect(execution).resolves.toBe('done')
      expect(events).toEqual(['finally'])
    },
  )

  it('factory default parameterのinjectをconstruction時に1回だけ解決する', async () => {
    interface Service {
      readonly value: string
    }
    const SERVICE = token<Service>('layer.service')
    let constructions = 0
    const injected = layer({
      name: 'injected',
      factory: (service = inject(SERVICE)) => {
        constructions += 1
        return async (_ctx, next) => {
          expect(service.value).toBe('resolved')
          await next()
        }
      },
    })
    const pipeline: readonly PipelineItem[] = [injected([injected]), terminal]
    const container = new Container([
      provide(SERVICE).useValue({ value: 'resolved' }),
    ])
    container.preparePipeline(pipeline)

    await executePipeline(pipeline, {
      context: {},
      validate: () => undefined,
      terminal: () => 'done',
      layer: (descriptor) => container.layerRuntime(descriptor),
    })
    expect(constructions).toBe(1)
  })

  it('Layer contract errorを専用Error型で返す', async () => {
    const skipped = layer({
      name: 'skipped',
      factory: () => async () => undefined,
    })
    await expect(
      executePipeline([skipped, terminal], hooks({})),
    ).rejects.toBeInstanceOf(LayerContractError)
  })
})
