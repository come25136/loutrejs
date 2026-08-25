import {
  contract,
  contextKey,
  defineModule,
  implement,
  inject,
  layer,
  type PipelineItem,
  provide,
  procedure,
  token,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import { http } from '@loutrejs/http'
import { messagePort } from '@loutrejs/message-port'
import { z } from 'zod'

const Body = z.object({ ok: z.boolean() })

function protocol(pipeline: readonly PipelineItem[], path = '/fixture') {
  return http({
    method: 'GET',
    path,
    responses: { ok: { status: 200, body: Body } },
    pipeline,
  } as never)
}

function passthrough(name: string) {
  return layer({
    name,
    factory: () => async (_ctx, next) => {
      await next()
    },
  })
}

describe('Application Graph IRとsemantic validation', () => {
  it('callable Layerのrecursive LayerIRとfactory DI edgeを生成する', () => {
    interface Database {
      transaction(next: () => Promise<void>): Promise<void>
    }
    const DATABASE = token<Database>('database.graph')
    const transactionLayer = layer({
      name: 'transaction',
      factory:
        (database = inject(DATABASE)) =>
        async (_ctx, next) => {
          await database.transaction(next)
        },
    })
    const inside = layer({
      name: 'inside',
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const authorization = layer({
      name: 'authorization',
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const nested = transactionLayer([inside])
    const outer = transactionLayer([authorization, nested, http.controller])
    const Contract = contract(
      {
        run: procedure({ protocols: { http: protocol([outer]) } }),
      },
      { name: 'RecursiveGraphContract' },
    )
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      providers: [
        provide(DATABASE).useValue({
          transaction: async (next) => {
            await next()
          },
        }),
      ],
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    const { graph, diagnostics } = compileApplication([Module()])
    expect(diagnostics).toEqual([])
    expect(graph.version).toBe(2)
    const root = graph.pipelines[0]?.layers[0]
    expect(root).toMatchObject({
      index: 0,
      name: 'transaction',
    })
    expect(root?.pipeline?.[1]).toMatchObject({
      index: 1,
      name: 'transaction',
    })
    expect(root?.pipeline?.[1]?.pipeline?.[0]?.index).toBe(0)
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'layer:RecursiveGraphContract:run:http:0',
        to: 'token:database.graph',
        kind: 'inject',
        source: 'probed',
      }),
    )
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        from: 'layer:RecursiveGraphContract:run:http:0.1',
        to: 'token:database.graph',
        kind: 'inject',
        source: 'probed',
      }),
    )
  })

  it('recursive terminal ruleとprotocol一致を検証する', () => {
    const childOwner = passthrough('terminal-owner')([http.controller])
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([childOwner, passthrough('too-late')]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }),
    )

    const mismatch = passthrough('mismatch')([messagePort.handler])
    const MismatchContract = contract({
      run: procedure({ protocols: { http: protocol([mismatch]) } }),
    })
    const MismatchModule = defineModule(() => ({
      implementations: [
        implement(MismatchContract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(compileApplication([MismatchModule()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_003' }),
    )
  })

  it('Layer factoryの未解決DIを診断する', () => {
    const MISSING = token<object>('layer.missing')
    const injected = layer({
      name: 'injected',
      factory:
        (_missing = inject(MISSING)) =>
        async (_ctx, next) => {
          await next()
        },
    })
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([injected, http.controller]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_DI_UNRESOLVED' }),
    )
  })

  it('Graph Probeでfactoryだけを同期実行しruntimeとchildを実行しない', () => {
    let factoryCalls = 0
    let runtimeCalls = 0
    const probeSafe = layer({
      name: 'probe-safe',
      factory: () => {
        factoryCalls += 1
        return async (_ctx, next) => {
          runtimeCalls += 1
          await next()
        }
      },
    })
    const child = layer({
      name: 'child',
      factory: () => async (_ctx, next) => {
        runtimeCalls += 1
        await next()
      },
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([probeSafe([child, http.controller])]) },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toEqual([])
    expect(factoryCalls).toBe(1)
    expect(runtimeCalls).toBe(0)
  })

  it('recursive PipelineのContextとvalidation stateを順序どおり検証する', () => {
    const SESSION = contextKey('recursive.session').of<string>()
    const provider = layer({
      name: 'recursive-provider',
      provides: [SESSION],
      factory: () => async (_ctx, next) => {
        await next({ 'recursive.session': 'ready' })
      },
    })
    const childOwner = passthrough('recursive-state')([
      provider,
      {
        kind: 'validation',
        name: 'validate.body',
        role: 'validation',
        part: 'body',
      },
    ])
    const consumer = layer({
      name: 'recursive-consumer',
      requires: [SESSION],
      requiresValidated: ['body'],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([childOwner, consumer, http.controller]) },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toEqual([])
  })

  it('recursive Pipeline全体のterminal exactly oneを検証する', () => {
    const first = passthrough('first-terminal')([http.controller])
    const second = passthrough('second-terminal')([http.controller])
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([first, second]) } }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_001' }),
    )
  })

  it('childのshortCircuit declarationをresponseと照合する', () => {
    const child = layer({
      name: 'recursive-short-circuit',
      shortCircuits: [
        {
          protocol: 'http',
          variant: 'missing',
          response: { status: 409 },
        },
      ],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const childOwner = passthrough('short-circuit-owner')([child])
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([childOwner, http.controller]) },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_SHORT_CIRCUIT_001' }),
    )
  })
  it('rejects a terminal that is not last', () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([http.controller, passthrough('too-late')]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    const result = compileApplication([Module()])

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }),
    )
  })

  it('Protocolと異なるterminalを拒否する', () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([messagePort.handler]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(
      compileApplication([Module()]).diagnostics.map(({ code }) => code),
    ).toContain('LUTRE_PIPELINE_003')
  })

  it('detects missing and duplicate implementation coverage', () => {
    const Contract = contract({
      get: procedure({ protocols: { http: protocol([http.controller]) } }),
      list: procedure({
        protocols: { http: protocol([http.controller], '/fixture-list') },
      }),
    })
    class First {
      get() {}
    }
    class Second {
      get() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .procedures('get')
          .with(First as any),
        implement(Contract)
          .for(http)
          .procedures('get')
          .with(Second as any),
      ],
    }))
    const codes = compileApplication([Module()]).diagnostics.map(
      (diagnostic) => diagnostic.code,
    )

    expect(codes).toContain('LUTRE_IMPL_001')
    expect(codes).toContain('LUTRE_IMPL_002')
  })

  it('Controller constructorにはapplication providerだけを許可する', () => {
    const SESSION = token<{ id: string }>('session')
    const SESSION_CONTEXT = contextKey('session').of<{ id: string }>()
    class Controller {
      constructor(readonly session = inject(SESSION)) {}
      run() {}
    }
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([http.controller]) } }),
    })
    const InvalidModule = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(
      compileApplication([InvalidModule()]).diagnostics.map(({ code }) => code),
    ).toContain('LUTRE_DI_UNRESOLVED')

    const sessionLayer = layer({
      name: 'session',
      role: 'guard',
      provides: [SESSION_CONTEXT],
      factory: () => async (_ctx, next) => {
        await next({ session: { id: 'one' } })
      },
    })
    const LayerOnlyContract = contract({
      run: procedure({
        protocols: { http: protocol([sessionLayer, http.controller]) },
      }),
    })
    const LayerOnlyModule = defineModule(() => ({
      implementations: [
        implement(LayerOnlyContract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(
      compileApplication([LayerOnlyModule()]).diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain('LUTRE_DI_UNRESOLVED')

    const ValidModule = defineModule(() => ({
      providers: [provide(SESSION).useValue({ id: 'application' })],
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    expect(compileApplication([ValidModule()]).diagnostics).toEqual([])
  })

  it('emits the five initial graph dimensions without runtime-specific core APIs', () => {
    class Controller {
      run() {}
    }
    const Contract = contract({
      run: procedure({ protocols: { http: protocol([http.controller]) } }),
    })
    const Module = defineModule(() => ({
      name: 'GraphFixtureModule',
      description: 'graph fixture',
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))
    const { graph } = compileApplication([Module()])

    expect(graph.modules).toHaveLength(1)
    expect(graph.modules[0]?.name).toBe('GraphFixtureModule')
    expect(graph.providers).toEqual([])
    expect(graph.contracts).toHaveLength(1)
    expect(graph.pipelines[0]?.layers[0]?.role).toBe('terminal')
    expect(graph.capabilities.map(({ name }) => name)).toContain('http.server')
    expect(graph.capabilities.map(({ name }) => name)).toContain(
      'crypto.random',
    )
  })

  it('異なるtoken declarationの重複IDを拒否する', () => {
    const FIRST = token<string>('duplicate-token')
    const SECOND = token<string>('duplicate-token')
    const Module = defineModule(() => ({
      providers: [
        provide(FIRST).useValue('first'),
        provide(SECOND).useValue('second'),
      ],
    }))

    const result = compileApplication([Module()])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_TOKEN_001' }),
    )
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'LUTRE_DI_003' }),
    )
  })

  it('同じModule内のduplicate Providerを静的に拒否する', () => {
    const VALUE = token<string>('duplicate-provider.direct')
    const Module = defineModule(() => ({
      providers: [
        provide(VALUE).useValue('first'),
        provide(VALUE).useValue('second'),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_003',
        message: expect.stringContaining('duplicate-provider.direct'),
      }),
    )
  })

  it('importされたModule間のduplicate Providerを静的に拒否する', () => {
    const VALUE = token<string>('duplicate-provider.imported')
    const FirstModule = defineModule(() => ({
      description: 'FirstModule',
      providers: [provide(VALUE).useValue('first')],
    }))
    const SecondModule = defineModule(() => ({
      description: 'SecondModule',
      providers: [provide(VALUE).useValue('second')],
    }))
    const RootModule = defineModule(() => ({
      imports: [FirstModule(), SecondModule()],
    }))

    expect(compileApplication([RootModule()]).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_003',
        message: expect.stringMatching(/FirstModule.*SecondModule/u),
      }),
    )
  })

  it('未提供のContext Key requirementを拒否する', () => {
    const SESSION = contextKey('session').of<{ id: string }>()
    const guarded = layer({
      name: 'guarded',
      requires: [SESSION],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const Contract = contract({
      run: procedure({
        protocols: { http: protocol([guarded, http.controller]) },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_004' }),
    )
  })

  it('同名の異なるContext Key宣言を拒否する', () => {
    const FIRST = contextKey('session').of<string>()
    const SECOND = contextKey('session').of<string>()
    const firstLayer = layer({
      name: 'first',
      provides: [FIRST],
      factory: () => async (_ctx, next) => {
        await next({ session: 'first' })
      },
    })
    const secondLayer = layer({
      name: 'second',
      requires: [SECOND],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const Contract = contract({
      run: procedure({
        protocols: {
          http: protocol([firstLayer, secondLayer, http.controller]),
        },
      }),
    })
    class Controller {
      run() {}
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract)
          .for(http)
          .with(Controller as any),
      ],
    }))

    expect(compileApplication([Module()]).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_CONTEXT_002' }),
    )
  })
})
