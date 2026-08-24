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
})
