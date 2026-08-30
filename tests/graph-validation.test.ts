import {
  defineProtocolContract,
  protocolGroup,
  contextKey,
  defineModule,
  implementation,
  inject,
  layer,
  type PipelineItem,
  provide,
  token,
  type ContractDefinition,
} from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import { http } from '@loutrejs/loutre/http'
import { messagePort } from '@loutrejs/loutre/message-port'
import { z } from 'zod'
const Body = z.object({ ok: z.boolean() })
function protocol(pipeline: readonly PipelineItem[], path = '/fixture') {
  return http.route({
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
function graphImplementation(
  contractDefinition: ContractDefinition,
  options: {
    readonly name?: string
    readonly procedures?: readonly string[]
  } = {},
) {
  const procedures =
    options.procedures ??
    Object.entries(contractDefinition.procedures)
      .filter(([, definition]) => 'http' in definition.protocols)
      .map(([name]) => name)
  const runtime = Object.fromEntries(
    procedures.map((name) => [name, () => ({ kind: 'http-result' })]),
  )
  return implementation({
    name: options.name ?? 'Controller',
    contract: contractDefinition,
    protocol: http,
    ...(options.procedures === undefined ? {} : { procedures }),
    factory: () => runtime,
  } as never)
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([outer]),
      }),
      { name: 'RecursiveGraphContract' },
    )
    const Module = defineModule(() => ({
      providers: [
        provide(DATABASE).useValue({
          transaction: async (next) => {
            await next()
          },
        }),
      ],
      implementations: [graphImplementation(Contract)],
    }))
    const { graph, diagnostics } = compileApplication({ modules: [Module()] })
    expect(diagnostics).toEqual([])
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([childOwner, passthrough('too-late')]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }))
    const mismatch = passthrough('mismatch')([messagePort.handler])
    const MismatchContract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([mismatch]),
      }),
    )
    const MismatchModule = defineModule(() => ({
      implementations: [graphImplementation(MismatchContract)],
    }))
    expect(
      compileApplication({ modules: [MismatchModule()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_PIPELINE_003' }))
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([injected, http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_DI_UNRESOLVED' }))
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([probeSafe([child, http.controller])]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(compileApplication({ modules: [Module()] }).diagnostics).toEqual([])
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([childOwner, consumer, http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(compileApplication({ modules: [Module()] }).diagnostics).toEqual([])
  })
  it('recursive Pipeline全体のterminal exactly oneを検証する', () => {
    const first = passthrough('first-terminal')([http.controller])
    const second = passthrough('second-terminal')([http.controller])
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([first, second]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_PIPELINE_001' }))
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([childOwner, http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_SHORT_CIRCUIT_001' }),
    )
  })
  it('rejects a terminal that is not last', () => {
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([http.controller, passthrough('too-late')]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    const result = compileApplication({ modules: [Module()] })
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PIPELINE_002' }),
    )
  })
  it('Protocolと異なるterminalを拒否する', () => {
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([messagePort.handler]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain('LUTRE_PIPELINE_003')
  })
  it('detects missing and duplicate implementation coverage', () => {
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        get: protocol([http.controller]),
        list: protocol([http.controller], '/fixture-list'),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [
        graphImplementation(Contract, {
          name: 'First',
          procedures: ['get'],
        }),
        graphImplementation(Contract, {
          name: 'Second',
          procedures: ['get'],
        }),
      ],
    }))
    const codes = compileApplication({ modules: [Module()] }).diagnostics.map(
      (diagnostic) => diagnostic.code,
    )
    expect(codes).toContain('LUTRE_IMPL_001')
    expect(codes).toContain('LUTRE_IMPL_002')
  })
  it('Implementation factoryにはapplication providerだけを許可する', () => {
    const SESSION = token<{
      id: string
    }>('session')
    const SESSION_CONTEXT = contextKey('session').of<{
      id: string
    }>()
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([http.controller]),
      }),
    )
    const createImplementation = (contractDefinition: ContractDefinition) =>
      implementation({
        name: 'Controller',
        contract: contractDefinition,
        protocol: http,
        factory: (_session = inject(SESSION)) => ({ run() {} }),
      } as never)
    const Controller = createImplementation(Contract)
    const InvalidModule = defineModule(() => ({
      implementations: [Controller],
    }))
    expect(
      compileApplication({ modules: [InvalidModule()] }).diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain('LUTRE_DI_UNRESOLVED')
    const sessionLayer = layer({
      name: 'session',
      role: 'guard',
      provides: [SESSION_CONTEXT],
      factory: () => async (_ctx, next) => {
        await next({ session: { id: 'one' } })
      },
    })
    const LayerOnlyContract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([sessionLayer, http.controller]),
      }),
    )
    const LayerOnlyModule = defineModule(() => ({
      implementations: [createImplementation(LayerOnlyContract)],
    }))
    expect(
      compileApplication({ modules: [LayerOnlyModule()] }).diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain('LUTRE_DI_UNRESOLVED')
    const ValidModule = defineModule(() => ({
      providers: [provide(SESSION).useValue({ id: 'application' })],
      implementations: [Controller],
    }))
    expect(
      compileApplication({ modules: [ValidModule()] }).diagnostics,
    ).toEqual([])
  })
  it('emits the five initial graph dimensions without runtime-specific core APIs', () => {
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      name: 'GraphFixtureModule',
      description: 'graph fixture',
      implementations: [graphImplementation(Contract)],
    }))
    const { graph } = compileApplication({ modules: [Module()] })
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
    const result = compileApplication({ modules: [Module()] })
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
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(
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
    expect(
      compileApplication({ modules: [RootModule()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: 'LUTRE_DI_003',
        message: expect.stringMatching(/FirstModule.*SecondModule/u),
      }),
    )
  })
  it('未提供のContext Key requirementを拒否する', () => {
    const SESSION = contextKey('session').of<{
      id: string
    }>()
    const guarded = layer({
      name: 'guarded',
      requires: [SESSION],
      factory: () => async (_ctx, next) => {
        await next()
      },
    })
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([guarded, http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_PIPELINE_004' }))
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
    const Contract = defineProtocolContract(
      protocolGroup('http', {
        run: protocol([firstLayer, secondLayer, http.controller]),
      }),
    )
    const Module = defineModule(() => ({
      implementations: [graphImplementation(Contract)],
    }))
    expect(
      compileApplication({ modules: [Module()] }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'LUTRE_CONTEXT_002' }))
  })
})
