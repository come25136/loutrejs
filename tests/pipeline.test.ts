import {
  contextKey,
  layer,
  shortCircuit,
  type TerminalLayerDescriptor,
} from '@loutrejs/core'
import { LayerContractError, executePipeline } from '@loutrejs/runtime'

const terminal: TerminalLayerDescriptor<'test'> = {
  kind: 'terminal',
  name: 'test.handler',
  role: 'terminal',
  protocol: 'test',
}

describe('Pipeline engine', () => {
  it('inboundを宣言順、outboundを逆順で実行する', async () => {
    const events: string[] = []
    const create = (name: string) =>
      layer({
        name,
        inbound: () => {
          events.push(`${name}.inbound`)
        },
        outbound: () => {
          events.push(`${name}.outbound`)
        },
      })

    const result = await executePipeline([create('A'), create('B'), terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => {
        events.push('terminal')
        return 'done'
      },
    })

    expect(result).toBe('done')
    expect(events).toEqual([
      'A.inbound',
      'B.inbound',
      'terminal',
      'B.outbound',
      'A.outbound',
    ])
  })

  it('inboundが完了したLayerだけをunwindする', async () => {
    const events: string[] = []
    const first = layer({
      name: 'first',
      inbound: () => {
        events.push('first.inbound')
      },
      outbound: () => {
        events.push('first.outbound')
      },
    })
    const second = layer({
      name: 'second',
      inbound: () => {
        events.push('second.inbound')
        throw new Error('stop')
      },
      outbound: () => {
        events.push('second.outbound')
      },
    })

    await expect(
      executePipeline([first, second, terminal], {
        context: {},
        validate: () => undefined,
        terminal: () => 'unreachable',
      }),
    ).rejects.toThrow('stop')
    expect(events).toEqual([
      'first.inbound',
      'second.inbound',
      'first.outbound',
    ])
  })

  it('Context Keyで宣言した値を後段Layerへ渡す', async () => {
    const VALUE = contextKey('value').of<string>()
    const seen: string[] = []
    const provider = layer({
      name: 'provider',
      provides: [VALUE],
      inbound: () => ({ value: 'ready' }),
    })
    const consumer = layer({
      name: 'consumer',
      requires: [VALUE],
      inbound: (ctx) => {
        seen.push(ctx.value)
      },
    })
    await executePipeline([provider, consumer, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'done',
    })
    expect(seen).toEqual(['ready'])
  })

  it('同名でも異なるContext Key identityをrequirementとして扱わない', async () => {
    const PROVIDED = contextKey('session').of<string>()
    const REQUIRED = contextKey('session').of<string>()
    const provider = layer({
      name: 'provider',
      provides: [PROVIDED],
      inbound: () => ({ session: 'ready' }),
    })
    const consumer = layer({
      name: 'consumer',
      requires: [REQUIRED],
      inbound: () => undefined,
    })

    await expect(
      executePipeline([provider, consumer, terminal], {
        context: {},
        validate: () => undefined,
        terminal: () => 'unreachable',
      }),
    ).rejects.toThrow('利用できません')
  })

  it('宣言したContext Keyを返さないLayerをterminal前に拒否する', async () => {
    const SESSION = contextKey('session').of<string>()
    const broken = layer({
      name: 'broken-authentication',
      provides: [SESSION],
      inbound: (() => undefined) as any,
    })
    let terminalCalled = false

    await expect(
      executePipeline([broken, terminal], {
        context: {},
        validate: () => undefined,
        terminal: () => {
          terminalCalled = true
          return 'unreachable'
        },
      }),
    ).rejects.toThrow(LayerContractError)
    expect(terminalCalled).toBe(false)
  })

  it('既存Context propertyの暗黙上書きを拒否する', async () => {
    const SESSION = contextKey('session').of<string>()
    const provider = layer({
      name: 'session',
      provides: [SESSION],
      inbound: () => ({ session: 'new' }),
    })
    await expect(
      executePipeline([provider, terminal], {
        context: { session: 'old' },
        validate: () => undefined,
        terminal: () => 'unreachable',
      }),
    ).rejects.toThrow('上書きできません')
  })

  it('short circuit後もentered Layerを逆順にunwindする', async () => {
    const events: string[] = []
    const outer = layer({
      name: 'outer',
      inbound: () => {
        events.push('outer.inbound')
      },
      outbound: () => {
        events.push('outer.outbound')
      },
    })
    const cache = layer({
      name: 'cache',
      inbound: () => {
        events.push('cache.inbound')
        return shortCircuit('cached', 'hit')
      },
      outbound: (_ctx, outcome, state) => {
        events.push(`cache.outbound:${outcome.ok}:${state}`)
      },
    })
    const skipped = layer({
      name: 'skipped',
      inbound: () => {
        events.push('skipped.inbound')
      },
    })

    const result = await executePipeline([outer, cache, skipped, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => {
        events.push('terminal')
        return 'terminal-result'
      },
    })

    expect(result).toBe('cached')
    expect(events).toEqual([
      'outer.inbound',
      'cache.inbound',
      'cache.outbound:true:hit',
      'outer.outbound',
    ])
  })

  it('Composite Layerのchild pipelineをscope内で実行する', async () => {
    const events: string[] = []
    const child = layer({
      name: 'child',
      inbound: () => { events.push('child.inbound') },
      outbound: (_ctx, outcome) => {
        events.push(`child.outbound:${outcome.ok}:${'value' in outcome}`)
      },
    })
    const composite = layer.compose({
      name: 'composite',
      pipeline: [child],
      scope: () => ({
        run: async (execute) => {
          events.push('scope.begin')
          await execute()
          events.push('scope.end')
        },
      }),
    })

    await expect(executePipeline([composite, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => {
        events.push('terminal')
        return 'done'
      },
    })).resolves.toBe('done')
    expect(events).toEqual([
      'scope.begin',
      'child.inbound',
      'child.outbound:true:false',
      'scope.end',
      'terminal',
    ])
  })

  it('空のchild pipelineはcontinueする', async () => {
    const composite = layer.compose({
      name: 'empty',
      pipeline: [],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    await expect(executePipeline([composite, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'done',
    })).resolves.toBe('done')
  })

  it('child terminalとshortCircuitのresultを親へbubbleする', async () => {
    const terminalComposite = layer.compose({
      name: 'terminal-composite',
      pipeline: [terminal],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    await expect(executePipeline([terminalComposite], {
      context: {},
      validate: () => undefined,
      terminal: () => 'terminal-result',
    })).resolves.toBe('terminal-result')

    const cached = layer({
      name: 'cached',
      inbound: () => shortCircuit('cached-result'),
    })
    const shortCircuitComposite = layer.compose({
      name: 'short-circuit-composite',
      pipeline: [cached],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    await expect(executePipeline([shortCircuitComposite, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).resolves.toBe('cached-result')
  })

  it('child errorはscopeがcatchしても元errorを再throwする', async () => {
    const failure = new Error('child failure')
    const broken = layer({
      name: 'broken',
      inbound: () => { throw failure },
    })
    const composite = layer.compose({
      name: 'catching-scope',
      pipeline: [broken],
      scope: () => ({
        run: async (execute) => {
          try {
            await execute()
          } catch {
            // Scope Layerはchild errorをsuccessへ変換できない。
          }
        },
      }),
    })

    await expect(executePipeline([composite, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).rejects.toBe(failure)
  })

  it('scope callbackの未実行と再入を拒否する', async () => {
    const skipped = layer.compose({
      name: 'skipped',
      pipeline: [],
      scope: () => ({ run: async () => undefined }),
    })
    await expect(executePipeline([skipped, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).rejects.toThrow('LUTRE_LAYER_SCOPE_SKIPPED')

    const reentered = layer.compose({
      name: 'reentered',
      pipeline: [],
      scope: () => ({
        run: async (execute) => {
          await execute()
          try {
            await execute()
          } catch {
            // Runtimeはscopeがreentry errorを握り潰しても検出する。
          }
        },
      }),
    })
    await expect(executePipeline([reentered, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).rejects.toThrow('LUTRE_LAYER_SCOPE_REENTRY')
  })

  it('childのContext provideとvalidationを親後段へ伝播する', async () => {
    const VALUE = contextKey('recursiveValue').of<string>()
    const provider = layer({
      name: 'provider',
      provides: [VALUE],
      inbound: () => ({ recursiveValue: 'ready' }),
    })
    const validation = {
      kind: 'validation',
      name: 'validate.body',
      role: 'validation',
      part: 'body',
    } as const
    const composite = layer.compose({
      name: 'context-composite',
      pipeline: [provider, validation],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    const consumer = layer({
      name: 'consumer',
      requires: [VALUE],
      inbound: (context) => {
        expect(context.recursiveValue).toBe('ready')
      },
    })
    let validated = false

    await executePipeline([composite, consumer, terminal], {
      context: {},
      validate: () => { validated = true },
      terminal: () => {
        expect(validated).toBe(true)
        return 'done'
      },
    })
  })

  it('nested Composite Layerの順序と外側outbound outcomeを維持する', async () => {
    const events: string[] = []
    const outer = layer({
      name: 'outer-linear',
      inbound: () => { events.push('outer.inbound') },
      outbound: (_context, outcome) => {
        events.push(`outer.outbound:${String(outcome.value)}`)
      },
    })
    const inner = layer.compose({
      name: 'inner',
      pipeline: [terminal],
      scope: () => ({
        run: async (execute) => {
          events.push('inner.begin')
          await execute()
          events.push('inner.end')
        },
      }),
    })
    const composite = layer.compose({
      name: 'outer-composite',
      pipeline: [inner],
      scope: () => ({
        run: async (execute) => {
          events.push('composite.begin')
          await execute()
          events.push('composite.end')
        },
      }),
    })

    await executePipeline([outer, composite], {
      context: {},
      validate: () => undefined,
      terminal: () => {
        events.push('terminal')
        return 'done'
      },
    })
    expect(events).toEqual([
      'outer.inbound',
      'composite.begin',
      'inner.begin',
      'terminal',
      'inner.end',
      'composite.end',
      'outer.outbound:done',
    ])
  })

  it('child outbound errorでscopeとPipelineを失敗させる', async () => {
    const failure = new Error('outbound failure')
    const child = layer({
      name: 'outbound-broken',
      outbound: () => { throw failure },
    })
    const composite = layer.compose({
      name: 'composite',
      pipeline: [child],
      scope: () => ({ run: async (execute) => { await execute() } }),
    })
    await expect(executePipeline([composite, terminal], {
      context: {},
      validate: () => undefined,
      terminal: () => 'unreachable',
    })).rejects.toBe(failure)
  })
})
